import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class LocationService {
  private readonly googleMapsUrl = 'https://nominatim.openstreetmap.org/search';

  constructor(private httpService: HttpService) {}

  async getCoordinates(address: string): Promise<{ latitude: number; longitude: number }> {
    const url = `${this.googleMapsUrl}?format=json&q=${encodeURIComponent(address)}`;

    const headers = {
      'User-Agent': 'YourAppName/1.0 (contact@example.com)', // Your custom User-Agent
    };

    try {
      const response = await lastValueFrom(this.httpService.get(url, { headers }));
      const data = response.data;

      if (data.length === 0) {
        throw new HttpException('Location not found', HttpStatus.NOT_FOUND);
      }

      const location = data[0];
      return {
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lon),
      };
    } catch (error) {
      console.error('Error fetching location data:', error.response?.data || error.message);
      throw new HttpException('Failed to fetch location data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
