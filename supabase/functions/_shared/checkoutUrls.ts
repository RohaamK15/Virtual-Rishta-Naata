// Builds Stripe success/cancel URLs. Native app callers get a custom URL
// scheme deep link (registered in AndroidManifest.xml / Info.plist) so Stripe
// Checkout — opened in an external system browser tab, not the app's own
// WebView, per Apple/Google payment policy — can hand control back to the
// app once payment finishes. Web callers get ordinary website URLs.
const APP_SCHEME = "com.virtualrishtanaata.app";

export function buildReturnUrls(opts: {
  native: boolean;
  appUrl: string;
  page: string;
  successParams: Record<string, string>;
  cancelParams: Record<string, string>;
}) {
  const { native, appUrl, page, successParams, cancelParams } = opts;

  if (native) {
    const success = new URLSearchParams({ page, ...successParams });
    const cancel = new URLSearchParams({ page, ...cancelParams });
    return {
      successUrl: `${APP_SCHEME}://return?${success.toString()}`,
      cancelUrl: `${APP_SCHEME}://return?${cancel.toString()}`,
    };
  }

  const successQuery = new URLSearchParams(successParams).toString();
  const cancelQuery = new URLSearchParams(cancelParams).toString();
  return {
    successUrl: `${appUrl}/${page}?${successQuery}`,
    cancelUrl: `${appUrl}/${page}?${cancelQuery}`,
  };
}
