// Les types de validateurs disponibles
export enum ValidatorType {
  NOTAIRE = 0,
  GEOMETRE = 1,
  EXPERT_JURIDIQUE = 2
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
  validator: string;          // Adresse ethereum du validateur
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

// Interface pour suivre la progression des validations
export interface ValidationProgress {
  total: number;           // Nombre total de validations requises
  completed: number;       // Nombre de validations effectuées
  percentage: number;      // Pourcentage de completion
  validations: {
    type: ValidatorType;   // Type de validateur
    validated: boolean;    // Si validé ou non
    timestamp?: number;    // Quand validé
    validator?: string;    // Qui a validé
  }[];
}

// Interface pour la réponse de validation


// Interface pour les métadonnées de validation stockées sur IPFS
export interface ValidationMetadata {
  text: string;              // Commentaire
  validator: string;         // Adresse du validateur
  validatorRole: string;     // Rôle du validateur
  validatorEmail?: string;   // Email du validateur
  landId: string;           // ID du terrain
  timestamp: number;        // Timestamp Unix
  isValid: boolean;         // Décision
  validationType: string;   // Type de validation
}
export interface ValidateLandDto {
  landId: string;
  comment: string;
  isValid: boolean;
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

export interface ValidationDocument {
  _id?: string;
  landId: string;
  blockchainLandId: string;
  validator: string;
  validatorRole: string;
  timestamp: number;
  cidComments: string;
  isValidated: boolean;
  txHash: string;
  blockNumber: number;
}