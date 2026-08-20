#!/usr/bin/env bash
set -euo pipefail

readonly VALIDATOR_VERSION="1.6.2"
readonly CONFIG_VERSION="3.0.21"
readonly VALIDATOR_SHA256="244978514ad48f67c7573acfffc8f4fd73d81feda6f276710033f9913579857e"
readonly CONFIG_SHA256="399395de5f6240a76ccc5751e4ee9dd329e37f5f7cfe4ee5c93188294ce8cd68"
readonly CACHE_DIR="${PWD}/.cache/peppol"
readonly VALIDATOR_JAR="${CACHE_DIR}/validator-${VALIDATOR_VERSION}-standalone.jar"
readonly CONFIG_ZIP="${CACHE_DIR}/validation-configuration-bis-${CONFIG_VERSION}.zip"
readonly CONFIG_DIR="${CACHE_DIR}/configuration-${CONFIG_VERSION}"
readonly FIXTURE_DIR="${CACHE_DIR}/fixtures"
readonly REPORT_DIR="${CACHE_DIR}/reports"

mkdir -p "${CACHE_DIR}" "${FIXTURE_DIR}" "${REPORT_DIR}"
test -f "${VALIDATOR_JAR}" || curl -fsSL "https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar" -o "${VALIDATOR_JAR}"
test -f "${CONFIG_ZIP}" || curl -fsSL "https://github.com/itplr-kosit/validator-configuration-bis/releases/download/release-${CONFIG_VERSION}/validation-configuration-bis-${CONFIG_VERSION}.zip" -o "${CONFIG_ZIP}"

if [ "$(uname -s)" = "Linux" ]; then
  echo "${VALIDATOR_SHA256}  ${VALIDATOR_JAR}" | sha256sum -c
  echo "${CONFIG_SHA256}  ${CONFIG_ZIP}" | sha256sum -c
else
  test "$(shasum -a 256 "${VALIDATOR_JAR}" | awk '{print $1}')" = "${VALIDATOR_SHA256}"
  test "$(shasum -a 256 "${CONFIG_ZIP}" | awk '{print $1}')" = "${CONFIG_SHA256}"
fi

mkdir -p "${CONFIG_DIR}"
unzip -oq "${CONFIG_ZIP}" -d "${CONFIG_DIR}"
npx tsx scripts/generate-peppol-fixtures.ts "${FIXTURE_DIR}"
java -jar "${VALIDATOR_JAR}" -s "${CONFIG_DIR}/scenarios.xml" -r "${CONFIG_DIR}" -o "${REPORT_DIR}" "${FIXTURE_DIR}"/*.xml
