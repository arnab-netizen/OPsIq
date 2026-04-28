export type Entity = {
  id: string
  name: string
  type: "business_unit" | "client" | "project"
  createdAt: string
}

export type EntityLink = {
  entityId: string
  operatorItemId: string
}
