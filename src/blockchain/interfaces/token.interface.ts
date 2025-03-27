export interface TokenData {
    landId: number;      // ID du terrain associé
    tokenNumber: number; // Numéro du token
    purchasePrice: string; // Prix d'achat du token (en BigNumber)
    mintDate: number;    // Date de création du token
  }
  
  export interface TokenMetadata {
    name: string;
    description: string;
    image: string;      // URL/IPFS de l'image
    attributes: TokenAttribute[];
  }
  
  export interface TokenAttribute {
    trait_type: string;
    value: string | number;
  }
  
  export interface TokenTransferEvent {
    tokenId: number;
    from: string;
    to: string;
    timestamp: number;
  }