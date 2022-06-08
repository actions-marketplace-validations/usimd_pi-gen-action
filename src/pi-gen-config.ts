import * as fs from 'fs/promises'
import {PiGenStages} from './pi-gen-stages'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

export interface PiGenConfig {
  imgName: string
  release: string
  deployCompression: string
  compressionLevel: string
  localeDefault: string
  targetHostname: string
  keyboardKeymap: string
  keyboardLayout: string
  timezoneDefault: string
  firstUserName: string
  firstUserPass?: string
  wpaEssid?: string
  wpaPassword?: string
  wpaCountry?: string
  enableSsh: string
  pubkeySshFirstUser?: string
  pubkeyOnlySsh: string
  stageList: string
  useQcow2: string
}

export const DEFAULT_CONFIG: PiGenConfig = {
  imgName: 'test',
  release: 'bullseye',
  deployCompression: 'zip',
  compressionLevel: '6',
  localeDefault: 'en_GB.UTF-8',
  targetHostname: 'raspberrypi',
  keyboardKeymap: 'gb',
  keyboardLayout: 'English (UK)',
  timezoneDefault: 'Europe/London',
  firstUserName: 'pi',
  enableSsh: '0',
  pubkeyOnlySsh: '0',
  stageList: 'stage*',
  useQcow2: '1'
}

export async function writeToFile(
  config: PiGenConfig,
  piGenDirectory: string,
  file: string
): Promise<void> {
  config = await absolutizePiGenStages(config, piGenDirectory)
  const configContent = Object.getOwnPropertyNames(config)
    .filter(prop => config[prop as keyof PiGenConfig])
    .map(
      prop =>
        `${camelCaseToSnakeCase(prop)}="${config[prop as keyof PiGenConfig]}"`
    )
    .join('\n')
  return fs.writeFile(file, configContent)
}

export async function validateConfig(config: PiGenConfig): Promise<void> {
  if (!config.imgName) {
    throw new Error('image-name must not be empty')
  }

  if (
    !['bullseye', 'jessie', 'stretch', 'buster', 'testing'].includes(
      config.release?.toLowerCase()
    )
  ) {
    throw new Error(
      'release must be one of ["bullseye", "jessie", "stretch", "buster", "testing"]'
    )
  }

  if (
    !['none', 'zip', 'gz', 'xz'].includes(
      config.deployCompression?.toLowerCase()
    )
  ) {
    throw new Error('compression must be one of ["none", "zip", "gz", "xz"]')
  }

  if (!/^[0-9]$/.test(config.compressionLevel)) {
    throw new Error('compression-level must be between 0 and 9')
  }

  const cutCmd = await io.which('cut', true)
  const supportedLocales = (
    await exec.getExecOutput(
      cutCmd,
      ['-d', ' ', '-f1', '/usr/share/i18n/SUPPORTED'],
      {silent: true}
    )
  ).stdout.split('\n')
  if (!supportedLocales.includes(config.localeDefault)) {
    throw new Error(
      'locale is not included in the list of supported locales (retrieved from /usr/share/i18n/SUPPORTED)'
    )
  }

  if (!config.targetHostname) {
    throw new Error('hostname must not be empty')
  }

  if (!config.keyboardKeymap) {
    throw new Error('keyboard-keymap must not be empty')
  }

  if (!config.keyboardLayout) {
    throw new Error('keyboard-layout must not be empty')
  }

  const supportedTimezones = (
    await exec.getExecOutput('timedatectl', ['list-timezones'], {silent: true})
  ).stdout.split('\n')
  if (!supportedTimezones.includes(config.timezoneDefault)) {
    throw new Error(
      'timezone is not included in output of "timedatectl list-timezones"'
    )
  }

  if (!config.firstUserName) {
    throw new Error('username must not be empty')
  }

  if (
    config.wpaPassword &&
    (config.wpaPassword?.length < 8 || config.wpaPassword?.length > 63)
  ) {
    throw new Error(
      'wpa-password must be between 8 and 63 characters (or unset)'
    )
  }

  if (!config.stageList) {
    throw new Error('stage-list must not be empty')
  }

  for (const stageDir of config.stageList.split(' ')) {
    if (!Object.values(PiGenStages).includes(stageDir)) {
      try {
        const stat = await fs.stat(stageDir)
        if (!stat.isDirectory) {
          throw new Error()
        }
      } catch (error) {
        throw new Error(
          'stage-list must contain valid pi-gen stage names "stage[0-5]" and/or valid directories'
        )
      }
    }
  }
}

function camelCaseToSnakeCase(label: string): string {
  return label.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()
}

async function absolutizePiGenStages(
  config: PiGenConfig,
  piGenDirectory: string
): Promise<PiGenConfig> {
  const stages = config.stageList.split(' ')
  core.debug(
    `Resolving directories to asbolute paths: ${stages} using pi-gen base dir ${piGenDirectory}`
  )
  for (let i = 0; i < stages.length; i++) {
    stages[i] = await fs.realpath(
      Object.values(PiGenStages).includes(stages[i])
        ? `${piGenDirectory}/${stages[i]}`
        : stages[i]
    )
  }
  config.stageList = stages.join(' ')
  return config
}