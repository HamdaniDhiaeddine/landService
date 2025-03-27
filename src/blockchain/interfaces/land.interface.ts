import { ValidationStatus } from "./validator.interface";


export interface Land {
  location: string;
  surface: number;
  owner: string;
  isRegistered: boolean;
  registrationDate: number;
  status: ValidationStatus;
  totalTokens: number;
  availableTokens: number;
  pricePerToken: string; // BigNumber
  isTokenized: boolean;
  cid: string;
}

export interface LandRegistrationEvent {
  landId: number;
  location: string;
  owner: string;
  totalTokens: number;
  pricePerToken: string;
  cid: string;
  timestamp: number;
}