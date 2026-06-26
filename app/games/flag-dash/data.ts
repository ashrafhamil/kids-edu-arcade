// The country pool for Flag Dash — pure data, no React, no side effects.
// Only widely recognised flags so a 6–11 year old has a fair chance. Each flag
// is a standard regional-indicator emoji that renders on iOS / Android / macOS
// (the target devices). Question generation and scoring live in questions.ts.

export type Country = {
  /** Regional-indicator flag emoji, rendered very large. */
  flag: string;
  /** Display name shown on the answer buttons. */
  name: string;
};

export const COUNTRIES: Country[] = [
  { flag: "🇲🇾", name: "Malaysia" },
  { flag: "🇮🇩", name: "Indonesia" },
  { flag: "🇸🇬", name: "Singapore" },
  { flag: "🇯🇵", name: "Japan" },
  { flag: "🇨🇳", name: "China" },
  { flag: "🇰🇷", name: "South Korea" },
  { flag: "🇹🇭", name: "Thailand" },
  { flag: "🇮🇳", name: "India" },
  { flag: "🇺🇸", name: "USA" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇧🇷", name: "Brazil" },
  { flag: "🇲🇽", name: "Mexico" },
  { flag: "🇬🇧", name: "UK" },
  { flag: "🇫🇷", name: "France" },
  { flag: "🇩🇪", name: "Germany" },
  { flag: "🇮🇹", name: "Italy" },
  { flag: "🇪🇸", name: "Spain" },
  { flag: "🇳🇱", name: "Netherlands" },
  { flag: "🇨🇭", name: "Switzerland" },
  { flag: "🇸🇪", name: "Sweden" },
  { flag: "🇳🇴", name: "Norway" },
  { flag: "🇵🇹", name: "Portugal" },
  { flag: "🇪🇬", name: "Egypt" },
  { flag: "🇹🇷", name: "Turkey" },
  { flag: "🇸🇦", name: "Saudi Arabia" },
  { flag: "🇦🇺", name: "Australia" },
  { flag: "🇳🇿", name: "New Zealand" },
  { flag: "🇦🇷", name: "Argentina" },
  { flag: "🇬🇷", name: "Greece" },
  { flag: "🇷🇺", name: "Russia" },
  { flag: "🇻🇳", name: "Vietnam" },
  { flag: "🇵🇭", name: "Philippines" },
  { flag: "🇧🇳", name: "Brunei" },
  { flag: "🇵🇰", name: "Pakistan" },
  { flag: "🇧🇩", name: "Bangladesh" },
  { flag: "🇦🇪", name: "UAE" },
  { flag: "🇶🇦", name: "Qatar" },
  { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇲🇦", name: "Morocco" },
  { flag: "🇮🇪", name: "Ireland" },
  { flag: "🇧🇪", name: "Belgium" },
  { flag: "🇦🇹", name: "Austria" },
  { flag: "🇵🇱", name: "Poland" },
  { flag: "🇩🇰", name: "Denmark" },
  { flag: "🇫🇮", name: "Finland" },
  { flag: "🇮🇸", name: "Iceland" },
  { flag: "🇺🇦", name: "Ukraine" },
  { flag: "🇨🇿", name: "Czechia" },
  { flag: "🇨🇱", name: "Chile" },
  { flag: "🇨🇴", name: "Colombia" },
  { flag: "🇵🇪", name: "Peru" },
  { flag: "🇨🇺", name: "Cuba" },
];
