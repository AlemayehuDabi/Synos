import { Injectable, NotFoundException } from '@nestjs/common';
import type { Subtask } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import type { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtask.dto.js';

export interface SubtaskView {
  id: string;
  taskId: string;
  title: string;
  status: Subtask['status'];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const toView = (subtask: Subtask): SubtaskView => ({
  id: subtask.id,
  taskId: subtask.taskId,
  title: subtask.title,
  status: subtask.status,
  sortOrder: subtask.sortOrder,
  createdAt: subtask.createdAt,
  updatedAt: subtask.updatedAt,
});

@Injectable()
export class SubtaskService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, taskId: string): Promise<SubtaskView[]> {
    await this.findOwnedTask(userId, taskId);
    const rows = await this.prisma.subtask.findMany({
      where: { taskId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(userId: string, taskId: string, dto: CreateSubtaskDto): Promise<SubtaskView> {
    await this.findOwnedTask(userId, taskId);
    const last = await this.prisma.subtask.findFirst({ where: { taskId, deletedAt: null }, orderBy: { sortOrder: 'desc' } });
    const subtask = await this.prisma.subtask.create({
      data: { taskId, userId, title: dto.title, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return toView(subtask);
  }

  async update(userId: string, taskId: string, subtaskId: string, dto: UpdateSubtaskDto): Promise<SubtaskView> {
    await this.findOwnedTask(userId, taskId);
    await this.findOwnedSubtask(taskId, subtaskId);
    const subtask = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: { ...(dto.title !== undefined ? { title: dto.title } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}) },
    });
    return toView(subtask);
  }

  async remove(userId: string, taskId: string, subtaskId: string): Promise<void> {
    await this.findOwnedTask(userId, taskId);
    await this.findOwnedSubtask(taskId, subtaskId);
    await this.prisma.subtask.update({ where: { id: subtaskId }, data: { deletedAt: new Date() } });
  }

  private async findOwnedTask(userId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
  }

  private async findOwnedSubtask(taskId: string, subtaskId: string): Promise<void> {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, taskId, deletedAt: null }, select: { id: true } });
    if (!subtask) throw new NotFoundException('Subtask not found');
  }
}
