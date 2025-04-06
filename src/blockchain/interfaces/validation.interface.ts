// Les types de validateurs disponibles
export enum ValidatorType {
  NOTAIRE = 0,
  GEOMETRE = 1,
  EXPERT_JURIDIQUE = 2
}
export enum ValidationStatus {
  EnAttente,
  Valide,
  Rejete
}

// Les statuts possibles d'une validation de terrain
export enum LandValidationStatus {
  PENDING_VALIDATION = 'pending_validation',
  PARTIALLY_VALIDATED = 'partially_validated',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
  TOKENIZED = 'tokenized'
}

// Interface de base pour une validation
export interface Validation {
  validator: string;          // Adresse Ethereum du validateur
  timestamp: number;          // Timestamp Unix
  cidComments: string;        // CID IPFS des commentaires
  validatorType: ValidatorType;
  isValidated: boolean;
}

// Extension pour le stockage MongoDB
export interface ValidationDocument extends Validation {
  _id?: string;
  landId: string;            // ID MongoDB du terrain
  blockchainLandId: string;  // ID du terrain sur la blockchain
  txHash: string;            // Hash de la transaction de validation
  blockNumber: number;       // Numéro du bloc de la validation
  createdAt?: Date;         // Date de création dans MongoDB
  updatedAt?: Date;         // Date de mise à jour dans MongoDB
}

// Interface pour la requête de validation
export interface ValidationRequest {
  landId: string;           // ID MongoDB du terrain
  comment: string;          // Commentaire de validation
  isValid: boolean;         // Décision de validation
}




export interface ValidationResponse {
  success: boolean;
  message: string;
  data: {
    transaction: {
      hash: string;
      blockNumber: number;
      timestamp: number;
    };
    validation: ValidationDocument;
    land: {
      id: string;
      blockchainId: string;
      status: string;
      location: string;
      lastValidation: {
        validator: string;
        validatorRole: string;
        isValid: boolean;
        timestamp: number;
        cidComments: string;
      };
      validationProgress: {
        total: number;
        completed: number;
        percentage: number;
        validations: {
          role: string;
          validated: boolean;
          timestamp?: number;
          validator?: string;
        }[];
      };
    };
  };
}
export interface ValidationMetadata {
  text: string;
  validator: string;
  validatorRole: string;
  validatorEmail?: string;
  userId?: string;
  landId: string;
  timestamp: number;
  isValid: boolean;
  validationType: ValidatorType;
}

export interface ValidationDocument {
  _id?: string;
  landId: string;
  blockchainLandId: string;
  validator: string;
  validatorType: ValidatorType; // Champ obligatoire
  timestamp: number;
  cidComments: string;
  isValidated: boolean;
  txHash: string;
  blockNumber: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ValidationProgressItem {
  type: ValidatorType;
  validated: boolean;
  timestamp?: number;
  validator?: string;
}


// Les interfaces de progression de validation
export interface ValidationProgressValidation {
  role: string;           // Changé de 'type' à 'role'
  validated: boolean;
  timestamp?: number;
  validator?: string;
}

export interface ValidationProgress {
  total: number;
  completed: number;
  percentage: number;
  validations: ValidationProgressValidation[];
}

