/* 

    curl-impersonate by wearr.

    IF YOU PAID FOR THIS SOFTWARE, YOU HAVE BEEN SCAMMED!

*/

/*

CurlImpersonateOptions:

    method: A string that should read HTTP methods, GET or POST.
    headers: HTTP Headers in the form of a key:value pair object.
    body: Only required if using a method such as POST or any other option that requires a payload.
    timeout: an integer in milliseconds for a connection time-out
    followRedirects: A boolean that indicates whether or not redirects should be followed 
    flags: A string array where options such as crypto certs are accepted or other curl-impersonate flags.

*/

import { CurlImpersonateOptions, CurlResponse } from "./interfaces.js"
import presets from "./presets.js"
import * as proc from "child_process"
import * as path from "path"
import * as fs from "fs"

const __dirname = import.meta.dirname

export class CurlImpersonate {
  url: string
  options: CurlImpersonateOptions
  validMethods: Array<String>
  binary: string
  impersonatePresets: String[]

  constructor(url: string, options: CurlImpersonateOptions) {
    this.url = url
    this.options = options
    this.validMethods = ["GET", "POST"]
    this.binary = ""
    this.impersonatePresets = [
      "chrome-110",
      "chrome-116",
      "firefox-109",
      "firefox-117",
    ]
  }

  private checkIfPresetAndMerge() {
    if (this.options.impersonate === undefined) return
    if (this.options.impersonate.includes("_")) return
    if (this.impersonatePresets.includes(this.options.impersonate)) {
      let preset = presets[this.options.impersonate]
      this.options.headers = Object.assign(
        this.options?.headers ?? {},
        preset.headers,
      )
      this.options.flags = this.options.flags
        ? this.options.flags.concat(preset.flags)
        : preset.flags
    }
  }

  makeRequest(url?: string): Promise<CurlResponse> {
    if (url !== undefined) this.url = url
    return new Promise((resolve, reject) => {
      if (this.validateOptions(this.options)) {
        this.setProperBinary()
        if (
          this.binary &&
          fs.existsSync(path.join(__dirname, "..", "bin", this.binary))
        ) {
          fs.chmodSync(path.join(__dirname, "..", "bin", this.binary), 0o755)
        }
        this.checkIfPresetAndMerge()
        let headers = this.convertHeaderObjectToCURL()
        let flags = this.options.flags || []
        if (this.options.method == "GET") {
          this.getRequest(flags, headers)
            .then((response) => resolve(response))
            .catch((error) => reject(error))
        } else if (this.options.method == "POST") {
          this.postRequest(flags, headers, this.options.body)
            .then((response) => resolve(response))
            .catch((error) => reject(error))
        } else {
          // Handle other HTTP methods if needed
          reject(new Error("Unsupported HTTP method"))
        }
      } else {
        reject(new Error("Invalid options"))
      }
    })
  }

  setNewURL(url: string) {
    this.url = url
  }

  validateOptions(options: CurlImpersonateOptions) {
    if (this.validMethods.includes(options.method.toUpperCase())) {
      if (options.body !== undefined && options.method == "GET") {
        throw new Error("Method is GET with an HTTP payload!")
      } else {
        try {
          new URL(this.url)
          return true
        } catch {
          throw new Error("URL is invalid! Must have http:// or https:// !")
        }
      }
    } else {
      throw new Error(
        "Invalid Method! Valid HTTP methods are " + this.validMethods,
      )
    }
  }

  private setupBodyArgument(body: Object | undefined) {
    if (body !== undefined) {
      try {
        JSON.stringify(body)
      } catch {
        return body // Assume that content type is anything except www-form-urlencoded or form-data, not quite sure if graphql is supported.
      }
    } else {
      throw new Error(
        "Body is undefined in a post request! Current body is " +
          this.options.body,
      )
    }
  }
  private setProperBinary() {
    if (this.options?.impersonate?.includes("_")) {
      this.binary = this.options.impersonate
      return
    }
    let isFF =
      this.options.impersonate == "firefox-109" ||
      this.options.impersonate == "firefox-117"
    switch (process.platform) {
      case "linux":
        if (process.arch == "x64") {
          if (isFF) {
            this.binary = "curl-impersonate-firefox-linux-x86"
          } else {
            this.binary = "curl-impersonate-chrome-linux-x86"
          }

          break
        } else if (process.arch == "arm") {
          if (isFF) {
            this.binary = "curl-impersonate-firefox-linux-aarch64"
          } else {
            this.binary = "curl-impersonate-chrome-linux-aarch64"
          }
          break
        } else {
          throw new Error(`Unsupported architecture: ${process.arch}`)
        }
      case "darwin":
        if (isFF) {
          this.binary = "curl-impersonate-firefox-darwin-x86"
        } else {
          this.binary = "curl-impersonate-chrome-darwin-x86"
        }
        break
      default:
        throw new Error(`Unsupported Platform! ${process.platform}`)
    }
  }
  private async getRequest(flags: Array<string>, headers: string) {
    // GET REQUEST
    flags.push("-v")
    let binpath = path.join(__dirname, "..", "bin", this.binary)
    let args = `${flags.join(" ")} ${headers} '${this.url}'`
    if (this.options.verbose) {
      console.log(
        new Object({
          binpath: binpath,
          args: args,
          url: this.url,
        }),
      )
    }
    // 1024x1024x2 =2147483648 adds large page support
    // https://nodejs.org/api/child_process.html#child_process_child_process_spawnsync_command_args_options
    const result = proc.spawnSync(`${binpath} ${args}`, {
      shell: true,
      maxBuffer: 2147483648,
    })
    let response = result.stdout.toString()
    let verbose = result.stderr.toString()

    let requestData = this.extractRequestData(verbose)
    let respHeaders = this.extractResponseHeaders(verbose)

    let returnObject: CurlResponse = {
      ipAddress: requestData.ipAddress,
      port: requestData.port,
      statusCode: requestData.statusCode,
      response: response,
      responseHeaders: respHeaders,
      requestHeaders: this.options.headers,
      verboseStatus: this.options.verbose ? true : false,
    }

    return returnObject
  }

  private async postRequest(
    flags: Array<string>,
    headers: string,
    body: Object | undefined,
  ) {
    // POST REQUEST
    flags.push("-v")
    let curlBody = this.setupBodyArgument(body)
    let binpath = path.join(__dirname, "..", "bin", this.binary)
    let args = `${flags.join(" ")} ${headers} ${this.url}`

    const result = proc.spawnSync(`${binpath} ${args} -d ${curlBody}`, {
      shell: true,
    })
    let response = result.stdout.toString()
    let cleanedPayload = response.replace(/\s+\+\s+/g, "")
    let verbose = result.stderr.toString()

    let requestData = this.extractRequestData(verbose)
    let respHeaders = this.extractResponseHeaders(verbose)

    let returnObject: CurlResponse = {
      ipAddress: requestData.ipAddress,
      port: requestData.port,
      statusCode: requestData.statusCode,
      response: cleanedPayload,
      responseHeaders: respHeaders,
      requestHeaders: this.options.headers,
      verboseStatus: this.options.verbose,
    }
    return returnObject
  }

  private extractRequestData(verbose: string) {
    const ipAddressRegex = /Trying (\S+):(\d+)/
    const httpStatusRegex = /< HTTP\/2 (\d+) ([^\n]+)/

    // Extract IP address and port
    const ipAddressMatch = verbose.match(ipAddressRegex)
    let port
    let ipAddress
    if (ipAddressMatch) {
      ipAddress = ipAddressMatch[1]
      port = parseInt(ipAddressMatch[2])
    }

    // Extract HTTP status code and headers
    const httpStatusMatch = verbose.match(httpStatusRegex)
    let statusCode
    if (httpStatusMatch) {
      statusCode = parseInt(httpStatusMatch[1])
    }
    return {
      ipAddress: ipAddress,
      port: port,
      statusCode: statusCode,
    }
  }

  private extractResponseHeaders(verbose: string) {
    const httpResponseRegex = /< ([^\n]+)/g
    let responseHeaders: { [key: string]: string } = {}
    const match = verbose.match(httpResponseRegex)
    if (match) {
      match.forEach((header: string) => {
        const headerWithoutPrefix = header.substring(2)
        const headerParts = headerWithoutPrefix.split(": ")
        if (headerParts.length > 1) {
          const headerName = headerParts[0].trim()
          const headerValue = headerParts[1].trim()
          responseHeaders[headerName] = headerValue
        }
      })
    }
    return responseHeaders
  }

  private convertHeaderObjectToCURL() {
    if (!this.options?.headers) {
      return ""
    }
    return (
      Object.entries(this.options.headers)
        .map(([key, value]) => `-H '${key}: ${value}'`)
        .join(" ") ?? ""
    )
  }
}

export default CurlImpersonate
