import { IsBoolean, IsOptional } from "class-validator";


export class AmenitiesDto {

  @IsOptional()
  @IsBoolean()
  electricity?: boolean;
  
  @IsOptional()
  @IsBoolean()
  gas?: boolean;
  
  @IsOptional()
  @IsBoolean()
  water?: boolean;
  
  @IsOptional()
  @IsBoolean()
  sewer?: boolean;
  
  @IsOptional()
  @IsBoolean()
  internet?: boolean;

  // Caractéristiques d'accès
  @IsOptional()
  @IsBoolean()
  roadAccess?: boolean; // Accès routier
  
  @IsOptional()
  @IsBoolean()
  publicTransport?: boolean; // Proximité des transports publics
  
  @IsOptional()
  @IsBoolean()
  pavedRoad?: boolean; // Route goudronnée

  // Caractéristiques urbanistiques
  @IsOptional()
  @IsBoolean()
  buildingPermit?: boolean; // Permis de construire
  
  
  @IsOptional()
  @IsBoolean()
  boundaryMarkers?: boolean; // Bornes de délimitation présentes

  // Gestion des eaux et drainage
  @IsOptional()
  @IsBoolean()
  drainage?: boolean; // Système de drainage
  
  @IsOptional()
  @IsBoolean()
  floodRisk?: boolean; // Risque d'inondation
  
  @IsOptional()
  @IsBoolean()
  rainwaterCollection?: boolean; // Collecte d'eau de pluie

  // Sécurité et clôture
  @IsOptional()
  @IsBoolean()
  fenced?: boolean; // Terrain clôturé
  

  // Caractéristiques naturelles
  @IsOptional()
  @IsBoolean()
  trees?: boolean; // Présence d'arbres
  
  @IsOptional()
  @IsBoolean()
  wellWater?: boolean; // Source d'eau/puits
  
  @IsOptional()
  @IsBoolean()
  flatTerrain?: boolean; // Terrain plat (vs. en pente)
}