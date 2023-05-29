export type EntityType = 'list' | 'pattern'

export type Entity = {
  type: EntityType
  name: string
  confidence: number
  value: string
  source: string
  charStart: number
  charEnd: number
}

export type EntityParser = {
  parse: (text: string) => Entity[]
}
