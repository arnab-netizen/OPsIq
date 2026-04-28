export type PolicyRule = {
  id: string
  condition: (impact: number) => boolean
  requiresApproval: boolean
}
