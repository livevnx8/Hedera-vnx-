/**
 * Carbon Credit Validation Error Codes
 * 
 * Descriptive error messages and codes for better developer experience
 */

export enum ValidationErrorCode {
  // Format errors (100-199)
  INVALID_ACCOUNT_ID = 'CARBON_100',
  INVALID_SIGNATURE_FORMAT = 'CARBON_101',
  INVALID_HASH_FORMAT = 'CARBON_102',
  INVALID_PROJECT_ID = 'CARBON_103',
  INVALID_VINTAGE_YEAR = 'CARBON_104',
  MISSING_REQUIRED_FIELDS = 'CARBON_105',
  
  // Business rule errors (200-299)
  CARBON_TONS_OUT_OF_RANGE = 'CARBON_200',
  INVALID_STANDARD = 'CARBON_201',
  INVALID_PROJECT_TYPE = 'CARBON_202',
  CREDIT_TOO_OLD = 'CARBON_203',
  CREDIT_EXPIRED = 'CARBON_204',
  
  // WV Power Grid errors (300-399)
  MISSING_GENERATION_DATA = 'CARBON_300',
  INVALID_FUEL_TYPE = 'CARBON_301',
  MWH_INCONSISTENCY = 'CARBON_302',
  WV_LOCATION_MISMATCH = 'CARBON_303',
  
  // Deep verification errors (400-499)
  HEDERA_VERIFICATION_FAILED = 'CARBON_400',
  MIRROR_NODE_MISMATCH = 'CARBON_401',
  
  // Unknown error
  UNKNOWN = 'CARBON_999'
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  field?: string;
  suggestion?: string;
}

export const ERROR_MESSAGES: Record<ValidationErrorCode, { message: string; suggestion: string }> = {
  [ValidationErrorCode.INVALID_ACCOUNT_ID]: {
    message: 'Hedera account ID must be in format 0.0.xxxxx',
    suggestion: 'Example: 0.0.12345'
  },
  [ValidationErrorCode.INVALID_SIGNATURE_FORMAT]: {
    message: 'Signature must be 64-character hexadecimal string',
    suggestion: 'Remove 0x prefix if present, ensure exactly 64 hex characters'
  },
  [ValidationErrorCode.INVALID_HASH_FORMAT]: {
    message: 'Data hash must be 64-character hexadecimal string',
    suggestion: 'Compute SHA-256 hash of the data payload'
  },
  [ValidationErrorCode.INVALID_PROJECT_ID]: {
    message: 'Project ID contains invalid characters',
    suggestion: 'Use only alphanumeric characters, hyphens, and underscores'
  },
  [ValidationErrorCode.INVALID_VINTAGE_YEAR]: {
    message: 'Vintage year is outside acceptable range',
    suggestion: `Valid range: 2000 to ${new Date().getFullYear() + 1}`
  },
  [ValidationErrorCode.MISSING_REQUIRED_FIELDS]: {
    message: 'Required fields are missing or empty',
    suggestion: 'Required: projectName, carbonTons, standard, location.country'
  },
  [ValidationErrorCode.CARBON_TONS_OUT_OF_RANGE]: {
    message: 'Carbon tons value is outside acceptable range',
    suggestion: 'Minimum: 0.001 tons, Maximum: 100,000,000 tons'
  },
  [ValidationErrorCode.INVALID_STANDARD]: {
    message: 'Carbon credit standard is not recognized',
    suggestion: 'Valid standards: VCS, GoldStandard, CAR, ACR, CDM, Other'
  },
  [ValidationErrorCode.INVALID_PROJECT_TYPE]: {
    message: 'Project type is not recognized',
    suggestion: 'Valid types: RENEWABLE_ENERGY, FORESTRY, METHANE_CAPTURE, DIRECT_AIR_CAPTURE, OTHER'
  },
  [ValidationErrorCode.CREDIT_TOO_OLD]: {
    message: 'Credit issuance is too old',
    suggestion: 'Credits must be less than 10 years old'
  },
  [ValidationErrorCode.CREDIT_EXPIRED]: {
    message: 'Credit has expired',
    suggestion: 'Check expiryDate field'
  },
  [ValidationErrorCode.MISSING_GENERATION_DATA]: {
    message: 'Renewable energy credits must include generation data',
    suggestion: 'Add generationData: { mwhGenerated, periodStart, periodEnd, fuelType }'
  },
  [ValidationErrorCode.INVALID_FUEL_TYPE]: {
    message: 'Fuel type is not recognized for renewable energy',
    suggestion: 'Valid types: SOLAR, WIND, HYDRO, GEOTHERMAL, BIOMASS'
  },
  [ValidationErrorCode.MWH_INCONSISTENCY]: {
    message: 'MWh generated is inconsistent with claimed carbon tons',
    suggestion: 'Typical ratio: 0.5-2.0 tons CO2 per MWh for renewables'
  },
  [ValidationErrorCode.WV_LOCATION_MISMATCH]: {
    message: 'Power grid region is WEST_VA but location is not in West Virginia',
    suggestion: 'Update location.state to "WV" or "West Virginia"'
  },
  [ValidationErrorCode.HEDERA_VERIFICATION_FAILED]: {
    message: 'Deep verification on Hedera network failed',
    suggestion: 'Check hederaAccountId exists and signature is valid'
  },
  [ValidationErrorCode.MIRROR_NODE_MISMATCH]: {
    message: 'Data does not match Hedera mirror node records',
    suggestion: 'Verify account exists and has recent activity'
  },
  [ValidationErrorCode.UNKNOWN]: {
    message: 'Unknown validation error occurred',
    suggestion: 'Check all fields and retry'
  }
};

export function createValidationError(
  code: ValidationErrorCode,
  field?: string
): ValidationError {
  const template = ERROR_MESSAGES[code] || ERROR_MESSAGES[ValidationErrorCode.UNKNOWN];
  return {
    code,
    message: template.message,
    field,
    suggestion: template.suggestion
  };
}

export function mapCheckToErrorCode(checkName: string): ValidationErrorCode {
  const mapping: Record<string, ValidationErrorCode> = {
    'account_format': ValidationErrorCode.INVALID_ACCOUNT_ID,
    'signature_format': ValidationErrorCode.INVALID_SIGNATURE_FORMAT,
    'hash_format': ValidationErrorCode.INVALID_HASH_FORMAT,
    'project_id_format': ValidationErrorCode.INVALID_PROJECT_ID,
    'vintage_valid': ValidationErrorCode.INVALID_VINTAGE_YEAR,
    'required_fields': ValidationErrorCode.MISSING_REQUIRED_FIELDS,
    'carbon_tons_range': ValidationErrorCode.CARBON_TONS_OUT_OF_RANGE,
    'valid_standard': ValidationErrorCode.INVALID_STANDARD,
    'valid_project_type': ValidationErrorCode.INVALID_PROJECT_TYPE,
    'credit_age': ValidationErrorCode.CREDIT_TOO_OLD,
    'not_expired': ValidationErrorCode.CREDIT_EXPIRED,
    'has_generation_data': ValidationErrorCode.MISSING_GENERATION_DATA,
    'valid_fuel_type': ValidationErrorCode.INVALID_FUEL_TYPE,
    'mwh_consistency': ValidationErrorCode.MWH_INCONSISTENCY,
    'wv_location_match': ValidationErrorCode.WV_LOCATION_MISMATCH,
    'hedera_attestation': ValidationErrorCode.HEDERA_VERIFICATION_FAILED,
    'mirror_node_sync': ValidationErrorCode.MIRROR_NODE_MISMATCH
  };
  
  return mapping[checkName] || ValidationErrorCode.UNKNOWN;
}
