export interface JsonSchemaNumber {
  type: 'number' | 'integer'
  description?: string
  minimum?: number
  maximum?: number
  step?: number
}

export interface JsonSchemaBoolean {
  type: 'boolean'
  description?: string
}

export interface JsonSchemaString<T extends string = string> {
  type: 'string'
  description?: string
  enum?: readonly T[]
  maxLength?: number
}

export interface JsonSchemaArray {
  type: 'array'
  description?: string
  items: JsonSchema
  maxItems?: number
  minItems?: number
}

export interface JsonSchemaObject {
  type: 'object'
  description?: string
  properties: Record<string, JsonSchema>
  required?: readonly string[]
  additionalProperties?: false
}

export type JsonSchema =
  | JsonSchemaNumber
  | JsonSchemaBoolean
  | JsonSchemaString
  | JsonSchemaArray
  | JsonSchemaObject

export type SchemaIssueReason =
  | 'oversized'
  | 'type'
  | 'unknown_field'
  | 'required'
  | 'minimum'
  | 'maximum'
  | 'enum'
  | 'maxLength'
  | 'maxItems'
  | 'minItems'

export interface SchemaIssue {
  path: string
  reason: SchemaIssueReason
  message: string
}

/** Максимальный размер входного JSON-патча (8 КБ). */
export const MAX_INPUT_BYTES = 8192

export interface ValidateOptions {
  /** Разрешить частичный патч объекта (отсутствующие поля не считаются ошибками). */
  partial?: boolean
  maxBytes?: number
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const joinPath = (base: string, key: string): string =>
  base === '' || base === '$' ? key : `${base}.${key}`

const byteLength = (v: unknown): number => {
  try {
    const s = JSON.stringify(v)
    return s ? new TextEncoder().encode(s).byteLength : 0
  } catch {
    return Infinity
  }
}

/** Проверяет значение или частичный патч по подмножеству JSON Schema и возвращает список ошибок с путями. */
export function validateSchema(
  value: unknown,
  schema: JsonSchema,
  options: ValidateOptions = {},
): SchemaIssue[] {
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES
  if (byteLength(value) > maxBytes) {
    return [{ path: '$', reason: 'oversized', message: `Input exceeds maximum size of ${maxBytes} bytes` }]
  }
  const issues: SchemaIssue[] = []
  checkNode(value, schema, '$', Boolean(options.partial), issues)
  return issues
}

function checkNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  partial: boolean,
  issues: SchemaIssue[],
): void {
  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) {
        issues.push({ path, reason: 'type', message: `Expected object at ${path}` })
        return
      }
      const keys = Object.keys(value)
      for (const k of keys) {
        const subSchema = schema.properties[k]
        const subPath = joinPath(path, k)
        if (!subSchema) {
          issues.push({ path: subPath, reason: 'unknown_field', message: `Unknown field "${subPath}"` })
          continue
        }
        const subVal = value[k]
        if (subVal === undefined) {
          issues.push({ path: subPath, reason: 'type', message: `Expected ${subSchema.type} at ${subPath}` })
          continue
        }
        checkNode(subVal, subSchema, subPath, partial, issues)
      }
      if (!partial && schema.required) {
        for (const req of schema.required) {
          if (!(req in value) || value[req] === undefined) {
            const subPath = joinPath(path, req)
            issues.push({ path: subPath, reason: 'required', message: `Missing required field "${subPath}"` })
          }
        }
      }
      return
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, reason: 'type', message: `Expected ${schema.type} at ${path}` })
        return
      }
      if (schema.type === 'integer' && !Number.isInteger(value)) {
        issues.push({ path, reason: 'type', message: `Expected integer at ${path}` })
        return
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        issues.push({
          path,
          reason: 'minimum',
          message: `Value at ${path} must be >= ${schema.minimum} (got ${value})`,
        })
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        issues.push({
          path,
          reason: 'maximum',
          message: `Value at ${path} must be <= ${schema.maximum} (got ${value})`,
        })
      }
      return
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        issues.push({ path, reason: 'type', message: `Expected boolean at ${path}` })
      }
      return
    }
    case 'string': {
      if (typeof value !== 'string') {
        issues.push({ path, reason: 'type', message: `Expected string at ${path}` })
        return
      }
      if (schema.enum && !schema.enum.includes(value)) {
        issues.push({
          path,
          reason: 'enum',
          message: `Value at ${path} must be one of: ${schema.enum.join(', ')}`,
        })
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        issues.push({
          path,
          reason: 'maxLength',
          message: `String at ${path} exceeds maximum length of ${schema.maxLength}`,
        })
      }
      return
    }
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ path, reason: 'type', message: `Expected array at ${path}` })
        return
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        issues.push({
          path,
          reason: 'minItems',
          message: `Array at ${path} must have at least ${schema.minItems} items`,
        })
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        issues.push({
          path,
          reason: 'maxItems',
          message: `Array at ${path} must have at most ${schema.maxItems} items`,
        })
      }
      for (let i = 0; i < value.length; i++) {
        checkNode(value[i], schema.items, `${path}[${i}]`, false, issues)
      }
      return
    }
  }
}
