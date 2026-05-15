import { Controller, Get, Post, Patch, Param, Body, Query, ValidationPipe } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  getAll(@Query('horizon') horizon?: string) {
    if (horizon) return this.goalsService.getGoalsByHorizon(horizon);
    return this.goalsService.getAllGoals();
  }

  @Get('active')
  getActive() {
    return this.goalsService.getActiveGoals();
  }

  @Post()
  create(@Body(new ValidationPipe()) dto: CreateGoalDto) {
    return this.goalsService.createGoal(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ValidationPipe()) dto: UpdateGoalDto) {
    return this.goalsService.updateGoal(id, dto);
  }

  @Patch(':id/done')
  markDone(@Param('id') id: string) {
    return this.goalsService.markGoalDone(id);
  }
}
