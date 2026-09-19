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

// ISO 3166-1 alpha-2 codes for every country in VRN_COUNTRIES, used to derive
// a flag emoji (see vrnCountryFlag below) — Kosovo (XK) isn't an official
// ISO code but is a real, widely-supported CLDR flag emoji, same as the rest.
const VRN_COUNTRY_ISO2 = {
  "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Andorra": "AD", "Angola": "AO",
  "Antigua and Barbuda": "AG", "Argentina": "AR", "Armenia": "AM", "Australia": "AU", "Austria": "AT",
  "Azerbaijan": "AZ", "Bahamas": "BS", "Bahrain": "BH", "Bangladesh": "BD", "Barbados": "BB",
  "Belarus": "BY", "Belgium": "BE", "Belize": "BZ", "Benin": "BJ", "Bhutan": "BT", "Bolivia": "BO",
  "Bosnia and Herzegovina": "BA", "Botswana": "BW", "Brazil": "BR", "Brunei": "BN", "Bulgaria": "BG",
  "Burkina Faso": "BF", "Burundi": "BI", "Cabo Verde": "CV", "Cambodia": "KH", "Cameroon": "CM",
  "Canada": "CA", "Central African Republic": "CF", "Chad": "TD", "Chile": "CL", "China": "CN",
  "Colombia": "CO", "Comoros": "KM", "Congo (Republic of the)": "CG", "Costa Rica": "CR", "Croatia": "HR",
  "Cuba": "CU", "Cyprus": "CY", "Czechia": "CZ", "Democratic Republic of the Congo": "CD", "Denmark": "DK",
  "Djibouti": "DJ", "Dominica": "DM", "Dominican Republic": "DO", "Ecuador": "EC", "Egypt": "EG",
  "El Salvador": "SV", "Equatorial Guinea": "GQ", "Eritrea": "ER", "Estonia": "EE", "Eswatini": "SZ",
  "Ethiopia": "ET", "Fiji": "FJ", "Finland": "FI", "France": "FR", "Gabon": "GA", "Gambia": "GM",
  "Georgia": "GE", "Germany": "DE", "Ghana": "GH", "Greece": "GR", "Grenada": "GD", "Guatemala": "GT",
  "Guinea": "GN", "Guinea-Bissau": "GW", "Guyana": "GY", "Haiti": "HT", "Honduras": "HN", "Hungary": "HU",
  "Iceland": "IS", "India": "IN", "Indonesia": "ID", "Iran": "IR", "Iraq": "IQ", "Ireland": "IE",
  "Israel": "IL", "Italy": "IT", "Ivory Coast": "CI", "Jamaica": "JM", "Japan": "JP", "Jordan": "JO",
  "Kazakhstan": "KZ", "Kenya": "KE", "Kiribati": "KI", "Kosovo": "XK", "Kuwait": "KW", "Kyrgyzstan": "KG",
  "Laos": "LA", "Latvia": "LV", "Lebanon": "LB", "Lesotho": "LS", "Liberia": "LR", "Libya": "LY",
  "Liechtenstein": "LI", "Lithuania": "LT", "Luxembourg": "LU", "Madagascar": "MG", "Malawi": "MW",
  "Malaysia": "MY", "Maldives": "MV", "Mali": "ML", "Malta": "MT", "Marshall Islands": "MH",
  "Mauritania": "MR", "Mauritius": "MU", "Mexico": "MX", "Micronesia": "FM", "Moldova": "MD",
  "Monaco": "MC", "Mongolia": "MN", "Montenegro": "ME", "Morocco": "MA", "Mozambique": "MZ",
  "Myanmar": "MM", "Namibia": "NA", "Nauru": "NR", "Nepal": "NP", "Netherlands": "NL",
  "New Zealand": "NZ", "Nicaragua": "NI", "Niger": "NE", "Nigeria": "NG", "North Korea": "KP",
  "North Macedonia": "MK", "Norway": "NO", "Oman": "OM", "Pakistan": "PK", "Palau": "PW",
  "Palestine": "PS", "Panama": "PA", "Papua New Guinea": "PG", "Paraguay": "PY", "Peru": "PE",
  "Philippines": "PH", "Poland": "PL", "Portugal": "PT", "Qatar": "QA", "Romania": "RO", "Russia": "RU",
  "Rwanda": "RW", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC",
  "Saint Vincent and the Grenadines": "VC", "Samoa": "WS", "San Marino": "SM",
  "Sao Tome and Principe": "ST", "Saudi Arabia": "SA", "Senegal": "SN", "Serbia": "RS",
  "Seychelles": "SC", "Sierra Leone": "SL", "Singapore": "SG", "Slovakia": "SK", "Slovenia": "SI",
  "Solomon Islands": "SB", "Somalia": "SO", "South Africa": "ZA", "South Korea": "KR",
  "South Sudan": "SS", "Spain": "ES", "Sri Lanka": "LK", "Sudan": "SD", "Suriname": "SR",
  "Sweden": "SE", "Switzerland": "CH", "Syria": "SY", "Taiwan": "TW", "Tajikistan": "TJ",
  "Tanzania": "TZ", "Thailand": "TH", "Timor-Leste": "TL", "Togo": "TG", "Tonga": "TO",
  "Trinidad and Tobago": "TT", "Tunisia": "TN", "Turkey": "TR", "Turkmenistan": "TM", "Tuvalu": "TV",
  "Uganda": "UG", "Ukraine": "UA", "United Arab Emirates": "AE", "United Kingdom": "GB",
  "United States": "US", "Uruguay": "UY", "Uzbekistan": "UZ", "Vanuatu": "VU", "Vatican City": "VA",
  "Venezuela": "VE", "Vietnam": "VN", "Yemen": "YE", "Zambia": "ZM", "Zimbabwe": "ZW",
};

// Derives a flag emoji from a country name via Unicode regional-indicator
// symbols (each letter of the ISO code maps to A-Z's regional-indicator
// codepoint block starting at U+1F1E6) — no image assets or network request
// needed. Returns "" for anything not in the map (e.g. a free-text "Other"
// country a member typed in), so callers should treat the result as
// optional decoration, not something always present.
function vrnCountryFlag(countryName) {
  const iso2 = VRN_COUNTRY_ISO2[countryName];
  if (!iso2) return "";
  return [...iso2].map((ch) => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join("");
}
