package android.webkit;

/** Framework error constructor is package-private; keep the fixture test-only. */
public final class LaunchTestWebResourceError extends WebResourceError {
    @Override public int getErrorCode() { return -2; }
    @Override public CharSequence getDescription() { return "Synthetic connection failure"; }
}
