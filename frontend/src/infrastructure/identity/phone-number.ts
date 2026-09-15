import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

export interface PhoneCountry {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
}

const SMS_CAPABLE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

function countryFlag(code: CountryCode): string {
  return [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

export function getPhoneCountries(locale = "tr"): PhoneCountry[] {
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale, { sensitivity: "base" });

  return getCountries()
    .map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
      callingCode: `+${getCountryCallingCode(code)}`,
      flag: countryFlag(code),
    }))
    .sort((left, right) => collator.compare(left.name, right.name));
}

export function formatPhoneInput(input: string, country: CountryCode): string {
  return new AsYouType(country).input(input);
}

export function normalizePhoneNumber(input: string, country: CountryCode): string | null {
  const value = input.trim();
  if (!value || !/^[+\d\s().-]+$/.test(value)) return null;

  const phone = parsePhoneNumberFromString(value, country);
  if (!phone?.isValid()) return null;

  const type = phone.getType();
  if (type && !SMS_CAPABLE_TYPES.has(type)) return null;
  return phone.number;
}
