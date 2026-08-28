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

// Separate EmailJS account (contact@virtualrishtanaata.com), created
// specifically for the profile-approved/rejected/comped notification — see
// notifyProfileDecision() in admin.html and email-templates/profile-decision.html.
// A different account means a different publicKey + serviceId, not just a
// different templateId — fill these in from that account's dashboard once
// the service (connected to contact@virtualrishtanaata.com) and the
// profile-decision template both exist there.
window.EMAILJS_DECISION_CONFIG = {
  publicKey: "DaV_HdiWRv6734-W3",
  serviceId: "service_5380n3l",
  templateId: "template_e1n24ui",
};
