export enum ValidatorType {
    Notaire,
    Geometre,
    ExpertJuridique
  }
  
  export enum ValidationStatus {
    EnAttente,
    Valide,
    Rejete
  }
  
  export interface Validator {
    address: string;
    type: ValidatorType;
    isActive: boolean;
  }
  
  export interface Validation {
    validator: string;
    timestamp: number;
    cidComments: string;
    validatorType: ValidatorType;
    isValidated: boolean;
  }