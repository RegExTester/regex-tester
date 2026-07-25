package io.github.regextester.api.service;

/**
 * A {@link CharSequence} that aborts once a deadline passes.
 *
 * <p>Java's regex engine has no native match timeout (unlike .NET's {@code Regex} matchTimeout), and
 * a catastrophically backtracking pattern will spin forever on the matching thread. Java also cannot
 * safely kill a thread — {@code Thread.stop} was removed in Java 20.
 *
 * <p>The remedy is to hand the matcher an input wrapper whose {@link #charAt(int)} consults a
 * deadline and throws once it passes. Backtracking necessarily reads characters, so the check fires
 * from inside the engine's own loop and unwinds it via the exception.
 *
 * <p>{@code charAt} is extremely hot, so {@link System#nanoTime()} is only read every
 * {@link #CHECK_INTERVAL} calls; the overhead is a mask and a decrement on the common path.
 */
public final class TimeLimitedCharSequence implements CharSequence {

    /** Power of two so the check reduces to a bitwise AND. */
    private static final int CHECK_INTERVAL = 1024;

    private final CharSequence delegate;
    private final long deadlineNanos;
    private int countdown = CHECK_INTERVAL;

    /** @param timeoutMillis how long from now the wrapped sequence stays readable */
    public static TimeLimitedCharSequence withTimeout(CharSequence delegate, long timeoutMillis) {
        return new TimeLimitedCharSequence(delegate, System.nanoTime() + timeoutMillis * 1_000_000L);
    }

    private TimeLimitedCharSequence(CharSequence delegate, long deadlineNanos) {
        this.delegate = delegate;
        this.deadlineNanos = deadlineNanos;
    }

    @Override
    public char charAt(int index) {
        if (--countdown <= 0) {
            countdown = CHECK_INTERVAL;
            if (System.nanoTime() > deadlineNanos) {
                throw new RegexTimeoutException();
            }
        }
        return delegate.charAt(index);
    }

    @Override
    public int length() {
        return delegate.length();
    }

    /**
     * Subsequences inherit the <em>same absolute deadline</em>, not a fresh one. The matcher creates
     * subsequences internally (e.g. for lookarounds), and giving each a new timeout would let a
     * pathological pattern run indefinitely by continually restarting the clock.
     */
    @Override
    public CharSequence subSequence(int start, int end) {
        return new TimeLimitedCharSequence(delegate.subSequence(start, end), deadlineNanos);
    }

    @Override
    public String toString() {
        return delegate.toString();
    }

    /** Thrown from {@link #charAt(int)} once the deadline passes. */
    public static final class RegexTimeoutException extends RuntimeException {

        RegexTimeoutException() {
            // No stack trace: this is control flow on a hot path, not an unexpected failure.
            super("The regex match timed out.", null, false, false);
        }
    }
}
