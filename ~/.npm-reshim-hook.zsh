# Auto-reshim for npm global installs
function npm() {
  command npm "$@"
  local exit_code=$?
  if [[ $exit_code -eq 0 && "$1" == "install" && ("$2" == "-g" || "$2" == "--global") ]]; then
    echo "Running: asdf reshim nodejs"
    asdf reshim nodejs
  fi
  return $exit_code
} 