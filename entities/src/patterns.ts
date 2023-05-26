import _ from 'lodash'
import { Entity, EntityParser } from './typings'

type ExtractedPattern = {
  value: string
  sourceIndex: number
}

const isPatternValid = (pattern: string): boolean => {
  if (!pattern) {
    return false
  }

  try {
    new RegExp(pattern)
    return pattern !== ''
  } catch (e) {
    return false
  }
}

// Padding is necessary due to the recursive nature of this function.
// Every found pattern is removed from the candidate, therefor the length of the extracted value (padding) is needed to compute sourceIndex of future extractions
function extractPattern(
  candidate: string,
  pattern: RegExp,
  extracted: ExtractedPattern[] = [],
  padding = 0
): ExtractedPattern[] {
  const res = pattern.exec(candidate)
  if (!res) {
    return extracted
  }

  const value = res[0]
  const nextPadding = padding + value.length
  const nextCandidate = candidate.slice(0, res.index) + candidate.slice(res.index + value.length)
  extracted.push({
    value,
    sourceIndex: res.index + padding
  })

  return extractPattern(nextCandidate, pattern, extracted, nextPadding)
}

const extractPatternEntities = (utterance: string, pattern_entities: any[]): Entity[] => {
  const input = utterance.toString()

  return _.flatMap(pattern_entities, (ent) => {
    const regex = new RegExp(ent.pattern!, ent.matchCase ? '' : 'i')

    return extractPattern(input, regex, []).map(
      (res: ExtractedPattern) =>
        ({
          type: 'pattern',
          name: ent.name,
          confidence: 1,
          char_start: Math.max(0, res.sourceIndex),
          char_end: Math.min(input.length, res.sourceIndex + res.value.length),
          value: res.value,
          source: res.value
        } satisfies Entity)
    )
  })
}

export type PatternEntity = {
  name: string
  pattern: string
  examples: string[]
  matchCase: boolean
  sensitive: boolean
}

export class PatternEntityParser implements EntityParser {
  public constructor(private pattern_entities: any[]) {}

  public parse(utterance: string): Entity[] {
    const invalidPattern = this.pattern_entities.find((ent) => !isPatternValid(ent.pattern))
    if (invalidPattern) {
      throw new Error(`Invalid pattern: ${invalidPattern.pattern}`)
    }
    return extractPatternEntities(utterance, this.pattern_entities)
  }
}
