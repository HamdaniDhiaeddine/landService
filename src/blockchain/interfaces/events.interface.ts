// Types pour les événements du LandRegistry
export interface LandRegisteredEvent {
    landId: number;
    location: string;
    owner: string;
    totalTokens: number;
    pricePerToken: string;
    cid: string;
  }
  
  export interface ValidatorAddedEvent {
    validator: string;
    validatorType: number;
  }
  
  export interface ValidationAddedEvent {
    landId: number;
    validator: string;
    isValidated: boolean;
  }
  
  // Types pour les événements du LandToken
  export interface TokenMintedEvent {
    landId: number;
    tokenId: number;
    owner: string;
  }
  
  export interface TokenTransferredEvent {
    tokenId: number;
    from: string;
    to: string;
  }
  
  // Types pour les événements du Marketplace
  export interface TokenListedEvent {
    tokenId: number;
    price: string;
    seller: string;
  }
  
  export interface TokenSoldEvent {
    tokenId: number;
    seller: string;
    buyer: string;
    price: string;
  }
  
  export interface ListingCancelledEvent {
    tokenId: number;
  }