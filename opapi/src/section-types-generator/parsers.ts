import { compile as compileSchemaToTypes } from 'json-schema-to-typescript'
import { title } from 'radash'
import { Operation, isOperationWithBodyProps } from 'src/state'
import { addPropertyToBlock, getBlankBlock, pascalize, remove$RefPropertiesFromSchema } from './helpers'
import { OperationParser, SectionParser } from './types'

export const parseReturnTypes: OperationParser = async ({ operationName, operation }) => {
  const response = operation.response
  if (!operation.response) return { ...getBlankBlock(), content: 'void' }
  // since we are using only a partial schema here and the refs will not resolve, we need to process the $ref properties differently
  const { schema, propertyNamesWith$Ref } = remove$RefPropertiesFromSchema(response.schema)
  const returnTypeString = await compileSchemaToTypes(schema, getReturnTypeName(operationName), {
    bannerComment: '',
  })
  const block = {
    dependencies: propertyNamesWith$Ref.map((property) => pascalize(property)),
    content: returnTypeString,
    title: getReturnTypeName(operationName),
  }
  return addPropertyToBlock(
    block,
    propertyNamesWith$Ref.map((property) => `\n  ${property}: ${title(property)};`).join(''),
  )
}

export const parseSectionTypes: SectionParser = async (section) => {
  if (section.schema === undefined) return getBlankBlock()
  const content = await compileSchemaToTypes(section.schema, section.section, { bannerComment: '' })
  return {
    dependencies: [],
    content: content,
    title: pascalize(section.section),
  }
}

export const parseFunctionDefinition: OperationParser = async ({ operationName, operation }) => {
  if (!operation) {
    return getBlankBlock()
  }
  const requestBodyName = getFunctionRequestBodyName(operationName)
  const paramsName = getFunctionParamName(operationName)
  const functionName = operationName
  const returnTypeName = getReturnTypeName(operationName)
  return {
    dependencies: [requestBodyName, paramsName, returnTypeName],
    title: functionName,
    content: `export type ${functionName} = (${getFunctionParams(operationName, operation)}) => ${returnTypeName}\n\n`,
  }
}

export const parseRequestParameterTypes: OperationParser = async ({ operationName, operation }) => {
  if (operation && isOperationWithBodyProps(operation)) {
    const functionRequestBodyName = getFunctionRequestBodyName(operationName)
    const content = await compileSchemaToTypes(operation.requestBody.schema, functionRequestBodyName, {
      bannerComment: '',
    })
    return { content, dependencies: [], title: functionRequestBodyName }
  }
  return getBlankBlock()
}

export const parseParameterTypes: OperationParser = async ({ operationName, operation }) => {
  const parameters = Object.entries(operation.parameters || {})
  if (operation && parameters.length > 0) {
    const functionParamName = getFunctionParamName(operationName)
    const content = parameters.reduce((stringifiedTypeDefinition, [name, parameter], index) => {
      if (parameter.description) {
        stringifiedTypeDefinition += `\n /**\n  * ${parameter.description}\n  */`
      }
      stringifiedTypeDefinition += `\n ${name}: ${parameter.type};`
      if (index === parameters.length - 1) {
        stringifiedTypeDefinition += '\n}\n\n'
      }
      return stringifiedTypeDefinition
    }, `export type ${functionParamName} = {`)
    return { content, dependencies: [], title: functionParamName }
  }
  return getBlankBlock()
}

function getReturnTypeName(operationName: string): string {
  return `${pascalize(operationName)}Response`
}

function getFunctionParams(
  operationName: string,
  operation: Operation<string, string, string, 'json-schema'> | undefined,
): string {
  if (!operation) {
    return ''
  }
  const parameters = Object.entries(operation.parameters || {})
  const operationHasBodyProps = isOperationWithBodyProps(operation)
  let paramsString = ''
  if (parameters.length || operationHasBodyProps) {
    paramsString += 'params: '
  }
  if (parameters.length) {
    paramsString += `${getFunctionParamName(operationName)}`
  }
  if (parameters.length && operationHasBodyProps) {
    paramsString += ' & '
  }
  if (operationHasBodyProps) {
    paramsString += `${pascalize(operationName)}Body`
  }
  return paramsString
}

function getFunctionRequestBodyName(operationName: string): string {
  return `${pascalize(operationName)}Body`
}

function getFunctionParamName(operationName: string): string {
  return `${pascalize(operationName)}BaseParams`
}
