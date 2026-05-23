import { Entity, EntityLink } from "@/domain/entity/types";

const entityStore: Entity[] = [];
const linkStore: EntityLink[] = [];

export function createEntity(entity: Entity): void {
  entityStore.push(entity);
}

export function getEntities(): Entity[] {
  return entityStore;
}

export function linkItem(entityId: string, operatorItemId: string): void {
  linkStore.push({ entityId, operatorItemId });
}

export function getItemsByEntity(entityId: string): string[] {
  return linkStore
    .filter((l) => l.entityId === entityId)
    .map((l) => l.operatorItemId);
}
