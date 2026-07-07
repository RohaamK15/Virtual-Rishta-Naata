// Shared country list + <select> population helpers, used by every page that
// lists countries (signup.html, search.html) so the list only needs updating
// in one place.
const VRN_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia",
  "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium",
  "Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria",
  "Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad",
  "Chile","China","Colombia","Comoros","Congo (Republic of the)","Costa Rica","Croatia","Cuba","Cyprus",
  "Czechia","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji",
  "Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea",
  "Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq",
  "Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati",
  "Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein",
  "Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands",
  "Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco",
  "Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger",
  "Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia",
  "Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino",
  "Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore",
  "Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain",
  "Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania",
  "Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan",
  "Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay",
  "Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

// Fills a <select> with a placeholder, optionally an "Any Country" option,
// every country in VRN_COUNTRIES (minus any excluded), and an "Other" option
// at the end. Pair with vrnWireCountryOther() to reveal a specify-country
// field when "Other" is chosen.
function vrnPopulateCountrySelect(selectEl, { placeholder = "Select a country", anyLabel = null, exclude = [] } = {}) {
  if (!selectEl) return;
  const previousValue = selectEl.value;
  selectEl.innerHTML = "";

  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = placeholder;
  selectEl.appendChild(placeholderOpt);

  if (anyLabel) {
    const anyOpt = document.createElement("option");
    anyOpt.value = anyLabel;
    anyOpt.textContent = anyLabel;
    selectEl.appendChild(anyOpt);
  }

  for (const country of VRN_COUNTRIES) {
    if (exclude.includes(country)) continue;
    const opt = document.createElement("option");
    opt.textContent = country;
    selectEl.appendChild(opt);
  }

  const otherOpt = document.createElement("option");
  otherOpt.textContent = "Other";
  selectEl.appendChild(otherOpt);

  if (previousValue) selectEl.value = previousValue;
}

// Shows/hides (and requires) a free-text "specify country" field next to a
// country <select> whenever "Other" is the selected option.
function vrnWireCountryOther(selectEl, otherFieldEl) {
  if (!selectEl || !otherFieldEl) return;
  const sync = () => {
    const isOther = selectEl.value === "Other";
    otherFieldEl.style.display = isOther ? "block" : "none";
    if (!isOther) otherFieldEl.value = "";
  };
  selectEl.addEventListener("change", sync);
  sync();
}

// Resolves what should actually be stored/searched for a country field: the
// free-text value if "Other" was chosen and specified, otherwise the
// select's own value.
function vrnResolveCountryValue(selectEl, otherFieldEl) {
  if (selectEl.value === "Other") return otherFieldEl.value.trim();
  return selectEl.value;
}
