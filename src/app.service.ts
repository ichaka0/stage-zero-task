import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, catchError } from 'rxjs';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  async classifyName(name: string) {
    const url = `https://api.genderize.io/?name=${encodeURIComponent(name)}`;

    // Call Genderize API
    const { data } = await firstValueFrom(
      this.httpService.get(url).pipe(
        catchError((error) => {
          throw new HttpException(
            { status: 'error', message: 'Upstream or server failure' },
            HttpStatus.BAD_GATEWAY,
          );
        }),
      ),
    );

    // Handle Edge Cases: null gender or 0 count
    if (data.gender === null || data.count === 0) {
      throw new HttpException(
        { status: 'error', message: 'No prediction available for the provided name' },
        HttpStatus.NOT_FOUND, 
      );
    }

    // Process variables
    const sample_size = data.count;
    const probability = data.probability;
    
    // Compute confidence
    const is_confident = probability >= 0.7 && sample_size >= 100;
    
    const processed_at = new Date().toISOString();

    return {
      status: 'success',
      data: {
        name: data.name,
        gender: data.gender,
        probability: probability,
        sample_size: sample_size,
        is_confident: is_confident,
        processed_at: processed_at,
      },
    };
  }
}

