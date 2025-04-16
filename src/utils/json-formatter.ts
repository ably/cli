import chalk from 'chalk'

/**
 * Format JSON data with syntax highlighting for console output
 * @param data Any data that can be serialized to JSON
 * @returns A colored string representation of the JSON data
 */
export function formatJson(data: unknown): string {
  if (data === undefined) return chalk.gray('undefined')
  if (data === null) return chalk.gray('null')

  try {
    // For non-object/non-array simple values, don't do full JSON formatting
    if (typeof data !== 'object' || data === null) {
      return colorValue(data)
    }

    // For objects and arrays, do pretty printing with color
    const jsonString = JSON.stringify(data, null, 2)
    return colorizeJson(jsonString)
  } catch {
    // If JSON serialization fails, return the string representation
    return String(data)
  }
}

/**
 * Determine if data is likely to be JSON
 * @param data The data to check
 * @returns True if the data is a JSON object or array
 */
export function isJsonData(data: unknown): boolean {
  if (data === null || data === undefined) return false
  
  if (typeof data === 'object') {
    return true
  }
  
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return typeof parsed === 'object' && parsed !== null
    } catch {
      return false
    }
  }
  
  return false
}

/**
 * Color a JSON value based on its type
 * @param value The value to colorize
 * @returns Colorized string representation
 */
function colorValue(value: unknown): string {
  if (value === null) return chalk.gray('null')
  if (value === undefined) return chalk.gray('undefined')
  
  switch (typeof value) {
    case 'number': { return chalk.yellow(value)
    }

    case 'boolean': { return chalk.cyan(value)
    }

    case 'string': { return chalk.green(`"${value}"`)
    }

    default: { return String(value)
    }
  }
}

/**
 * Add colors to a JSON string
 * @param jsonString JSON string to colorize
 * @returns Colorized JSON string
 */
function colorizeJson(jsonString: string): string {
  // Using replace with global flag for each pattern
  let result = jsonString;
  
  // Keys
  result = result.replaceAll(/"([^"]+)":/g, (_, key) => `${chalk.blue(`"${key}"`)}: `);
  
  // String values
  result = result.replaceAll(/: "([^"]*)"/g, (_, value) => `: ${chalk.green(`"${value}"`)}`);
  
  // Numbers
  result = result.replaceAll(/: (-?\d+\.?\d*)/g, (_, value) => `: ${chalk.yellow(value)}`);
  
  // Booleans
  result = result.replaceAll(/: (true|false)/g, (_, value) => `: ${chalk.cyan(value)}`);
  
  // null
  result = result.replaceAll(/: (null)/g, (_, value) => `: ${chalk.gray(value)}`);
  
  return result;
}
