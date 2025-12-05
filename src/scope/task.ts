// ============================================
// CLAUDE SUPERVISOR - TASK MANAGER
// ============================================

import { Task, TaskStatus, TaskItem, ItemStatus } from '../core/types';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// TASK MANAGER
// ============================================

export class TaskManager {
    // ========================================
    // TASK CREATION
    // ========================================

    public static createTask(title: string, description?: string): Task {
        return {
            id: uuidv4(),
            title,
            description,
            status: TaskStatus.PENDING,
            createdAt: Date.now(),
            items: [],
            requirements: [],
            notes: []
        };
    }

    public static createTaskWithItems(title: string, itemNames: string[]): Task {
        const task = this.createTask(title);
        task.items = itemNames.map(name => ({
            id: uuidv4(),
            name,
            status: ItemStatus.PENDING
        }));
        return task;
    }

    // ========================================
    // TASK STATE
    // ========================================

    public static startTask(task: Task): Task {
        return {
            ...task,
            status: TaskStatus.IN_PROGRESS,
            startedAt: Date.now()
        };
    }

    public static completeTask(task: Task): Task {
        return {
            ...task,
            status: TaskStatus.COMPLETED,
            completedAt: Date.now()
        };
    }

    public static cancelTask(task: Task): Task {
        return {
            ...task,
            status: TaskStatus.CANCELLED,
            completedAt: Date.now()
        };
    }

    // ========================================
    // ITEM MANAGEMENT
    // ========================================

    public static addItem(task: Task, name: string): Task {
        const item: TaskItem = {
            id: uuidv4(),
            name,
            status: ItemStatus.PENDING
        };

        return {
            ...task,
            items: [...task.items, item]
        };
    }

    public static removeItem(task: Task, itemId: string): Task {
        return {
            ...task,
            items: task.items.filter(i => i.id !== itemId)
        };
    }

    public static updateItemStatus(task: Task, itemId: string, status: ItemStatus): Task {
        return {
            ...task,
            items: task.items.map(i =>
                i.id === itemId ? { ...i, status } : i
            )
        };
    }

    public static setCurrentItem(task: Task, itemId: string): Task {
        return {
            ...task,
            items: task.items.map(i => ({
                ...i,
                status: i.id === itemId
                    ? ItemStatus.IN_PROGRESS
                    : (i.status === ItemStatus.IN_PROGRESS ? ItemStatus.PENDING : i.status)
            }))
        };
    }

    // ========================================
    // PROGRESS
    // ========================================

    public static getProgress(task: Task): {
        completed: number;
        total: number;
        percentage: number;
        currentItem?: TaskItem;
    } {
        const completed = task.items.filter(i => i.status === ItemStatus.COMPLETED).length;
        const total = task.items.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const currentItem = task.items.find(i => i.status === ItemStatus.IN_PROGRESS);

        return { completed, total, percentage, currentItem };
    }

    public static isComplete(task: Task): boolean {
        return task.items.length > 0 &&
               task.items.every(i => i.status === ItemStatus.COMPLETED);
    }

    public static getPendingItems(task: Task): TaskItem[] {
        return task.items.filter(i => i.status === ItemStatus.PENDING);
    }

    public static getCompletedItems(task: Task): TaskItem[] {
        return task.items.filter(i => i.status === ItemStatus.COMPLETED);
    }

    // ========================================
    // DURATION
    // ========================================

    public static getDuration(task: Task): number {
        if (!task.startedAt) return 0;
        const endTime = task.completedAt || Date.now();
        return endTime - task.startedAt;
    }

    public static formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}min`;
        } else if (minutes > 0) {
            return `${minutes}min`;
        } else {
            return `${seconds}s`;
        }
    }

    // ========================================
    // SERIALIZATION
    // ========================================

    public static toJSON(task: Task): string {
        return JSON.stringify(task, null, 2);
    }

    public static fromJSON(json: string): Task {
        return JSON.parse(json) as Task;
    }
}
