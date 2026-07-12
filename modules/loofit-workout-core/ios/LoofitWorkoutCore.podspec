require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LoofitWorkoutCore'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = { :type => 'MIT' }
  s.author         = 'Loofit'
  s.homepage       = 'https://github.com/ehzero/loofit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.frameworks = 'ActivityKit', 'AppIntents', 'CryptoKit', 'WidgetKit'
  s.libraries = 'sqlite3'
  s.source_files = '*.swift'
  s.exclude_files = 'LoofitWorkoutCoreModule.swift', 'Tests/**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
    test_spec.requires_app_host = false
    test_spec.libraries = 'c++'
  end
end
