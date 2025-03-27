export interface Listing {
    tokenId: number;
    price: string;      // Prix en BigNumber
    seller: string;     // Adresse du vendeur
    isActive: boolean;
  }
  
  export interface MarketplaceEvent {
    eventType: 'Listed' | 'Sold' | 'Cancelled';
    tokenId: number;
    price?: string;
    seller: string;
    buyer?: string;
    timestamp: number;
  }