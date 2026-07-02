// From your EmailJS dashboard (https://dashboard.emailjs.com):
// - publicKey:  Account > General > Public Key
// - serviceId:  Email Services > (your connected inbox) > Service ID
// - templateId: Email Templates > (your template) > Template ID
//
// The public key is designed to be used client-side (like a Stripe
// publishable key) — it only allows sending through templates you've set up
// on your own account, it isn't a secret.
window.EMAILJS_CONFIG = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_EMAILJS_SERVICE_ID",
  templateId: "YOUR_EMAILJS_TEMPLATE_ID",
};
