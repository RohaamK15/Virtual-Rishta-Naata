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
  // Both templates' "To Email" is set to two comma-separated addresses (the
  // admin inbox plus a {{...}} variable for whoever actually booked/signed
  // up) — one send() reaches both, since EmailJS's free plan caps the
  // number of templates and a second one wasn't available.
  templateId: "template_qisck9a",       // consultation request confirmation (services.html) — see email-templates/consultation-request.html
  signupTemplateId: "template_fbvt045",  // new member signup confirmation (signup.html) — see email-templates/new-signup.html
};
