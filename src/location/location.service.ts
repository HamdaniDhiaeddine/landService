import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class LocationService {
  private readonly googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  private readonly googleMapsUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor(private httpService: HttpService) {}

  /** 📍 Convert Address to Coordinates */
  async getCoordinates(address: string): Promise<{ latitude: number; longitude: number }> {
    const url = `${this.googleMapsUrl}?address=${encodeURIComponent(address)}&key=${this.googleMapsApiKey}`;

    try {
      const response = await lastValueFrom(this.httpService.get(url));
      const data = response.data;

      if (data.status !== 'OK' || data.results.length === 0) {
        throw new HttpException(`Google Maps API Error: ${data.status}`, HttpStatus.BAD_REQUEST);
      }

      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    } catch (error) {
      throw new HttpException('Failed to fetch location data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
