import { Contract, ContractTransaction, BaseContract } from 'ethers';

export enum ValidationStatus {
    EnAttente,
    Valide,
    Rejete
}

export enum ValidatorType {
    Notaire,
    Geometre,
    ExpertJuridique
}

export interface Land {
    location: string;
    surface: bigint;
    owner: string;
    isRegistered: boolean;
    registrationDate: bigint;
    status: ValidationStatus;
    totalTokens: bigint;
    availableTokens: bigint;
    pricePerToken: bigint;
    isTokenized: boolean;
    cid: string;
}

export interface Validation {
    validator: string;
    timestamp: bigint;
    cidComments: string;
    validatorType: ValidatorType;
    isValidated: boolean;
}

// Interface pour les méthodes du contrat
export interface LandRegistryInterface extends BaseContract {
    // Fonctions d'administration
    owner: () => Promise<string>;
    transferOwnership: (newOwner: string) => Promise<ContractTransaction>;
    pause: () => Promise<ContractTransaction>;
    unpause: () => Promise<ContractTransaction>;
    paused: () => Promise<boolean>;

    // Gestion des relayers
    addRelayer: (relayer: string) => Promise<ContractTransaction>;
    removeRelayer: (relayer: string) => Promise<ContractTransaction>;
    relayers: (address: string) => Promise<boolean>;

    // Gestion des validateurs
    addValidator: (validator: string, type: ValidatorType) => Promise<ContractTransaction>;
    validators: (address: string) => Promise<boolean>;
    validatorTypes: (address: string) => Promise<ValidatorType>;

    // Gestion des terrains
    registerLand: (
        location: string,
        surface: bigint,
        totalTokens: bigint,
        pricePerToken: bigint,
        cid: string
    ) => Promise<ContractTransaction>;

    validateLand: (
        landId: number,
        cidComments: string,
        isValid: boolean,
        validator: string,
        options?: { gasLimit: number }
    ) => Promise<ContractTransaction>;

    // Fonctions de consultation
    getLandCounter: () => Promise<bigint>;
    currentLandId: () => Promise<bigint>;
    
    getLandDetails: (landId: number) => Promise<[
        boolean,     // isTokenized
        number,      // status (ValidationStatus)
        bigint,      // availableTokens
        bigint,      // pricePerToken
        string       // cid
    ]>;

    getAllLandDetails: (landId: number) => Promise<[
        string,      // location
        bigint,      // surface
        string,      // owner
        boolean,     // isRegistered
        bigint,      // registrationDate
        number,      // status (ValidationStatus)
        bigint,      // totalTokens
        bigint,      // availableTokens
        bigint,      // pricePerToken
        boolean,     // isTokenized
        string       // cid
    ]>;

    getValidationHistory: (landId: number) => Promise<Validation[]>;

    // Gestion de la tokenisation
    tokenizer: () => Promise<string>;
    setTokenizer: (tokenizer: string) => Promise<ContractTransaction>;
    tokenizeLand: (landId: number) => Promise<ContractTransaction>;
    updateAvailableTokens: (landId: number, amount: bigint) => Promise<ContractTransaction>;
}

// Type pour le contrat complet
export type LandRegistryContract = Contract & LandRegistryInterface;