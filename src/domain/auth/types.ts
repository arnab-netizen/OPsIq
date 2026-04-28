export type UserRole = "admin" | "operator" | "viewer"

export type User = {
  id: string
  role: UserRole
}
