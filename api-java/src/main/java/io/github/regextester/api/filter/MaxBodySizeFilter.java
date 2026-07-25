package io.github.regextester.api.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.regextester.api.model.ProblemDetailsResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rejects oversized request bodies with HTTP 413 and an RFC 9457 problem body.
 *
 * <p>Two layers, mirroring api-python's ASGI middleware:
 *
 * <ul>
 *   <li>If {@code Content-Length} already declares more than the limit, the request is rejected
 *       immediately without reading the body at all.
 *   <li>Otherwise — no {@code Content-Length}, chunked transfer-encoding, or a client that
 *       understates the length — the input stream is wrapped so bytes are counted as they stream in
 *       and reading aborts the moment the running total crosses the limit.
 * </ul>
 *
 * <p>Being a servlet filter, this runs <em>before</em> the {@code DispatcherServlet}, so an
 * oversized body is always reported as 413 and never as 400 — even when one of its fields would also
 * have failed its {@code maxLength} check. Contract §4 requires exactly that ordering.
 *
 * <p>It is ordered just after {@code CorsConfig}'s {@code CorsFilter} so that the 413 it produces
 * still carries CORS headers; mapping-based CORS would not apply, because that is handled inside the
 * {@code DispatcherServlet} this filter short-circuits.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class MaxBodySizeFilter extends OncePerRequestFilter {

    /** Single source of truth for this limit; the capability document imports it from here. */
    public static final int MAX_REQUEST_BODY_BYTES = 8192;

    private final ObjectMapper objectMapper;

    public MaxBodySizeFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (request.getContentLengthLong() > MAX_REQUEST_BODY_BYTES) {
            reject(response);
            return;
        }

        CountingRequestWrapper wrapped = new CountingRequestWrapper(request);
        try {
            filterChain.doFilter(wrapped, response);
        } catch (BodyTooLargeException e) {
            // Thrown from the wrapped stream while Jackson was reading. Nothing has been committed
            // yet, because the handler never ran.
            if (!response.isCommitted()) {
                response.reset();
                reject(response);
            }
        }
    }

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(
                response.getOutputStream(),
                ProblemDetailsResponse.payloadTooLarge(MAX_REQUEST_BODY_BYTES));
        response.flushBuffer();
    }

    /** Signals that the streamed body crossed the limit. Unwrapped by {@code ApiExceptionHandler}. */
    public static class BodyTooLargeException extends RuntimeException {

        public BodyTooLargeException() {
            super("Request body exceeds " + MAX_REQUEST_BODY_BYTES + " bytes.", null, false, false);
        }
    }

    private static final class CountingRequestWrapper extends HttpServletRequestWrapper {

        private CountingRequestWrapper(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            return new CountingServletInputStream(super.getInputStream());
        }
    }

    private static final class CountingServletInputStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private long count;

        private CountingServletInputStream(ServletInputStream delegate) {
            this.delegate = delegate;
        }

        private void add(long bytes) {
            count += bytes;
            if (count > MAX_REQUEST_BODY_BYTES) {
                throw new BodyTooLargeException();
            }
        }

        @Override
        public int read() throws IOException {
            int b = delegate.read();
            if (b != -1) {
                add(1);
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            int read = delegate.read(b, off, len);
            if (read > 0) {
                add(read);
            }
            return read;
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            delegate.setReadListener(readListener);
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }
}
