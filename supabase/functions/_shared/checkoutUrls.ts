// Builds Stripe success/cancel URLs. Both web and native callers get the
// same real website URL (APP_URL) back.
//
// Native used to get a custom URL scheme (myapp://return?...) instead, so the
// external browser tab could hand control back to the app once Stripe
// redirected. That broke in practice: Chrome on Android refuses to launch an
// external app for a navigation that isn't tied to a direct user gesture, and
// Stripe's post-payment redirect fires asynchronously — well after the
// original "Pay" click — so Chrome silently fell back to treating the scheme
// text as a literal (nonexistent) hostname, producing a DNS error instead of
// returning to the app.
//
// A verified Android App Link doesn't have that restriction: the OS
// intercepts navigation to these URLs before Chrome's gesture check ever
// applies, as long as the app declares a matching autoVerify intent-filter
// (see android/app/src/main/AndroidManifest.xml) and the domain serves a
// matching /.well-known/assetlinks.json.
export function buildReturnUrls(opts: {
  appUrl: string;
  page: string;
  successParams: Record<string, string>;
  cancelParams: Record<string, string>;
}) {
  const { appUrl, page, successParams, cancelParams } = opts;
  const successQuery = new URLSearchParams(successParams).toString();
  const cancelQuery = new URLSearchParams(cancelParams).toString();
  return {
    successUrl: `${appUrl}/${page}?${successQuery}`,
    cancelUrl: `${appUrl}/${page}?${cancelQuery}`,
  };
}
