require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LoofitWorkoutExpoAdapter'
  s.version        = package['version']
  s.summary        = 'Expo bridge for the Loofit workout domain core'
  s.description    = 'Keeps ExpoModulesCore out of Widget Extension processes while exposing LoofitWorkoutCore to the app.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Loofit'
  s.homepage       = 'https://github.com/ehzero/loofit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'LoofitWorkoutCore'
  s.source_files = 'LoofitWorkoutCoreModule.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
