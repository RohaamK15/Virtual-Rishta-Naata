// Mock profile data — for prototype/demo purposes only.
const PROFILES = [
  {
    ref: "VRN-2481", gender: "M", age: 29, height: "5'10\"",
    qualifications: "MSc Mechanical Engineering", employment: "Design Engineer, Automotive sector",
    residentialStatus: "Lives with parents", residency: "Manchester, Greater Manchester", country: "United Kingdom",
    preference: "Looking for someone grounded in faith, kind-hearted and family-oriented.",
    countryLookingIn: "United Kingdom", considerPakistan: "Yes",
    additional: "Happy to relocate within the UK after marriage.",
    about: "Softly spoken and easygoing. I enjoy hiking, calligraphy and volunteering at the local Jamaat. Looking to build a home rooted in faith and mutual respect.",
    email: "ref.vrn2481@virtualrishtanaata.com",
    photo: "https://placehold.co/400x500/E4EDE7/134B35?text=Photo+Available",
    hasPhoto: true, joined: "2026-03-14", status: "Active"
  },
  {
    ref: "VRN-3092", gender: "F", age: 26, height: "5'4\"",
    qualifications: "BA Psychology", employment: "Primary school teacher",
    residentialStatus: "Lives with parents", residency: "Birmingham, West Midlands", country: "United Kingdom",
    preference: "Seeking someone practising, respectful and career-driven.",
    countryLookingIn: "United Kingdom", considerPakistan: "No",
    additional: "Would prefer someone within a 2-hour drive of Birmingham.",
    about: "I love reading, baking and spending time with family. Community-minded and enjoy Lajna activities. Looking for a partner to grow with, spiritually and personally.",
    email: "ref.vrn3092@virtualrishtanaata.com",
    photo: null, hasPhoto: false, joined: "2026-02-02", status: "Active"
  },
  {
    ref: "VRN-1187", gender: "M", age: 34, height: "6'0\"",
    qualifications: "PhD Chemistry", employment: "Research Scientist",
    residentialStatus: "Lives independently", residency: "Toronto, Ontario", country: "Canada",
    preference: "Someone thoughtful, well-read and committed to their faith.",
    countryLookingIn: "Canada", considerPakistan: "Yes",
    additional: "",
    about: "Quiet by nature, deeply curious about the world. I enjoy chess, long walks and Waqf-e-Nau responsibilities. Value honesty above all else.",
    email: "ref.vrn1187@virtualrishtanaata.com",
    photo: "https://placehold.co/400x500/E4EDE7/134B35?text=Photo+Available",
    hasPhoto: true, joined: "2026-01-18", status: "Active"
  },
  {
    ref: "VRN-4420", gender: "F", age: 24, height: "5'2\"",
    qualifications: "BSc Pharmacy", employment: "Pharmacist",
    residentialStatus: "Lives with parents", residency: "Islamabad, Islamabad Capital Territory", country: "Pakistan",
    preference: "Looking for a practising, humble and financially settled partner.",
    countryLookingIn: "United Kingdom", considerPakistan: "Yes",
    additional: "Open to relocating after marriage, in sha Allah.",
    about: "Cheerful and family-oriented, I enjoy cooking, gardening and Quran classes. Hoping to find someone patient and sincere.",
    email: "ref.vrn4420@virtualrishtanaata.com",
    photo: null, hasPhoto: false, joined: "2026-04-01", status: "Active"
  },
  {
    ref: "VRN-0965", gender: "M", age: 31, height: "5'9\"",
    qualifications: "ACCA Qualified Accountant", employment: "Finance Manager",
    residentialStatus: "Lives independently", residency: "Sydney, New South Wales", country: "Australia",
    preference: "Someone caring, well-mannered, with a good sense of humour.",
    countryLookingIn: "Australia", considerPakistan: "No",
    additional: "Prefer someone already settled in Australia or willing to relocate.",
    about: "Balanced between work and faith. I enjoy cricket, cooking and Sunday hikes. Looking for a genuine connection built on trust.",
    email: "ref.vrn0965@virtualrishtanaata.com",
    photo: "https://placehold.co/400x500/E4EDE7/134B35?text=Photo+Available",
    hasPhoto: true, joined: "2025-12-20", status: "Active"
  },
  {
    ref: "VRN-5541", gender: "F", age: 29, height: "5'5\"",
    qualifications: "MSc Data Science", employment: "Data Analyst",
    residentialStatus: "Lives independently", residency: "London, Greater London", country: "United Kingdom",
    preference: "Looking for someone secure in their faith and identity, ambitious but grounded.",
    countryLookingIn: "United Kingdom", considerPakistan: "Yes",
    additional: "",
    about: "Independent and driven, but deeply value family and tradition. I enjoy travelling, pottery and Jamaat volunteering.",
    email: "ref.vrn5541@virtualrishtanaata.com",
    photo: null, hasPhoto: false, joined: "2026-05-11", status: "Active"
  },
  {
    ref: "VRN-2733", gender: "M", age: 27, height: "5'11\"",
    qualifications: "BEng Civil Engineering", employment: "Site Engineer",
    residentialStatus: "Lives with parents", residency: "Glasgow, Lanarkshire", country: "United Kingdom",
    preference: "Kind, practising and family-focused.",
    countryLookingIn: "United Kingdom", considerPakistan: "Yes",
    additional: "Willing to relocate anywhere in the UK.",
    about: "Down-to-earth and hardworking. I enjoy football, DIY projects and helping out at the mosque. Family means everything to me.",
    email: "ref.vrn2733@virtualrishtanaata.com",
    photo: "https://placehold.co/400x500/E4EDE7/134B35?text=Photo+Available",
    hasPhoto: true, joined: "2026-06-02", status: "Active"
  },
  {
    ref: "VRN-6108", gender: "F", age: 31, height: "5'6\"",
    qualifications: "MBBS, General Practitioner", employment: "NHS Doctor",
    residentialStatus: "Lives independently", residency: "Leeds, West Yorkshire", country: "United Kingdom",
    preference: "Looking for a practising, emotionally mature partner who values education.",
    countryLookingIn: "United Kingdom", considerPakistan: "No",
    additional: "",
    about: "Compassionate and calm under pressure — comes with the job! I enjoy painting, long drives and quiet evenings with a good book.",
    email: "ref.vrn6108@virtualrishtanaata.com",
    photo: null, hasPhoto: false, joined: "2026-05-28", status: "Active"
  }
];
