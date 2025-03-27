export interface Validation {
    validator: string;
    timestamp: number;
    cidComments: string;
    validatorType: number; // 0: Notaire, 1: Geometre, 2: ExpertJuridique
    isValidated: boolean;
  }