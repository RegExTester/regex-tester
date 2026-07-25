package io.github.regextester.api.model;

/** A single capture of a match or group. */
public record CaptureResult(int index, int length, String value) {
}
