import { Injectable } from '@nestjs/common';
import { TodayContributor, type TodayContext, type TodayContribution } from '../today/today-contributor.js';
import { HabitService } from './habit.service.js';

@Injectable()
@TodayContributor('habits')
export class HabitTodayContributor implements TodayContributor {
  constructor(private readonly habits: HabitService) {}

  async collect({ userId }: TodayContext): Promise<TodayContribution> {
    return this.habits.today(userId);
  }
}
