import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule], // Allows making HTTP requests
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
