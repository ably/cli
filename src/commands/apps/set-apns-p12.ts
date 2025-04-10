import { Args, Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import * as fs from 'fs'
import * as path from 'path'

export default class AppsSetApnsP12Command extends ControlBaseCommand {
  static description = 'Upload Apple Push Notification Service P12 certificate for an app'

  static examples = [
    '$ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12',
    '$ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --password "YOUR_CERTIFICATE_PASSWORD"',
    '$ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --use-for-sandbox',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'certificate': Flags.string({
      description: 'Path to the P12 certificate file',
      required: true,
    }),
    'password': Flags.string({
      description: 'Password for the P12 certificate',
    }),
    'use-for-sandbox': Flags.boolean({
      description: 'Whether to use this certificate for the APNS sandbox environment',
      default: false,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static args = {
    id: Args.string({
      description: 'App ID to set the APNS certificate for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsSetApnsP12Command)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Validate certificate file exists
      const certificatePath = path.resolve(flags.certificate)
      if (!fs.existsSync(certificatePath)) {
        this.error(`Certificate file not found: ${certificatePath}`)
        return
      }
      
      this.log(`Uploading APNS P12 certificate for app ${args.id}...`)
      
      // Read certificate file and encode as base64
      const certificateData = fs.readFileSync(certificatePath).toString('base64')
      
      const result = await controlApi.uploadApnsP12(
        args.id,
        certificateData,
        {
          useForSandbox: flags['use-for-sandbox'],
          password: flags.password,
        }
      )
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(result))
      } else {
        this.log(`\nAPNS P12 certificate uploaded successfully!`)
        this.log(`Certificate ID: ${result.id}`)
        if (flags['use-for-sandbox']) {
          this.log(`Environment: Sandbox`)
        } else {
          this.log(`Environment: Production`)
        }
      }
    } catch (error) {
      this.error(`Error uploading APNS P12 certificate: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 