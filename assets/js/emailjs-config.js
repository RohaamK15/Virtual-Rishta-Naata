// From your EmailJS dashboard (https://dashboard.emailjs.com):
// - publicKey:  Account > General > Public Key
// - serviceId:  Email Services > (your connected inbox) > Service ID
// - templateId: Email Templates > (your template) > Template ID
//
// The public key is designed to be used client-side (like a Stripe
// publishable key) — it only allows sending through templates you've set up
// on your own account, it isn't a secret.
window.EMAILJS_CONFIG = {
  publicKey: "OgOmel1OdnTJaWylP",
  serviceId: "service_yodtqdo",
  templateId: "template_qisck9a",       // consultation request notification, sent to admin (services.html) — see email-templates/consultation-request.html
  signupTemplateId: "template_fbvt045",  // new member signup notification, sent to admin (signup.html) — see email-templates/new-signup.html
  // Customer-facing confirmations — fill these in once created in EmailJS
  // (see email-templates/consultation-confirmation-customer.html and
  // email-templates/new-signup-customer-welcome.html for what to paste in,
  // including each one's "To Email" needing a dynamic {{...}} recipient
  // rather than a fixed address). Left blank sends nothing rather than
  // erroring, so the admin notifications above keep working either way.
  consultCustomerTemplateId: "",
  welcomeTemplateId: "",
};
