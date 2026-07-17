cmake_minimum_required(VERSION 3.13)
project(llvm_wasm_backend CXX)

set(CMAKE_CXX_STANDARD 17)

set(CROSS_TOOLCHAIN_FLAGS_NATIVE
  "-DCMAKE_C_COMPILER=/usr/bin/cc"
  "-DCMAKE_CXX_COMPILER=/usr/bin/c++"
  "-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON"
  CACHE STRING "Flags passed to the native cross-compilation host sub-build"
)

include(FetchContent)

# Keep the LLVM release in one reviewable file. Normal builds are reproducible;
# the scheduled release checker proposes updates rather than silently changing
# the compiler underneath the regression suite.
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/LLVM_VERSION" LLVM_RELEASE_VERSION LIMIT_COUNT 1)
string(STRIP "${LLVM_RELEASE_VERSION}" LLVM_RELEASE_VERSION)
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/LLVM_SHA256" LLVM_SOURCE_SHA256 LIMIT_COUNT 1)
string(STRIP "${LLVM_SOURCE_SHA256}" LLVM_SOURCE_SHA256)
string(LENGTH "${LLVM_SOURCE_SHA256}" LLVM_SOURCE_SHA256_LENGTH)
string(TIMESTAMP LLVM_BUILD_YEAR "%Y" UTC)
if(NOT LLVM_RELEASE_VERSION MATCHES "^[0-9]+\\.[0-9]+\\.[0-9]+$")
  message(FATAL_ERROR "LLVM_VERSION must contain a stable x.y.z release")
endif()
if(NOT LLVM_SOURCE_SHA256 MATCHES "^[0-9a-f]+$" OR
   NOT LLVM_SOURCE_SHA256_LENGTH EQUAL 64)
  message(FATAL_ERROR "LLVM_SHA256 must contain a lowercase SHA-256 digest")
endif()

FetchContent_Declare(
  llvm_project
  URL https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_RELEASE_VERSION}/llvm-project-${LLVM_RELEASE_VERSION}.src.tar.xz
  URL_HASH SHA256=${LLVM_SOURCE_SHA256}
  SOURCE_SUBDIR llvm
)

# ── LLVM build knobs ───────────────────────────────────────────────────────────
# Populate first so target classification comes from the pinned LLVM source,
# not from a stable/experimental split duplicated in this project.
FetchContent_GetProperties(llvm_project)
if(NOT llvm_project_POPULATED)
  FetchContent_Populate(llvm_project)
endif()

find_package(Python3 REQUIRED COMPONENTS Interpreter)
set(LLVM_TARGET_INVENTORY_REPORT "${CMAKE_BINARY_DIR}/target-inventory.json")
set(LLVM_TARGET_CACHE_FILE "${CMAKE_BINARY_DIR}/llvm-targets.cmake")
execute_process(
  COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/check_llvm_targets.py"
          --llvm-cmake "${llvm_project_SOURCE_DIR}/llvm/CMakeLists.txt"
          --llvm-version "${LLVM_RELEASE_VERSION}"
          --inventory "${CMAKE_CURRENT_SOURCE_DIR}/regression/llvm-target-inventory.json"
          --report "${LLVM_TARGET_INVENTORY_REPORT}"
          --cmake-cache "${LLVM_TARGET_CACHE_FILE}"
  RESULT_VARIABLE LLVM_TARGET_INVENTORY_STATUS
  OUTPUT_VARIABLE LLVM_TARGET_INVENTORY_OUTPUT
  ERROR_VARIABLE LLVM_TARGET_INVENTORY_ERROR
)
if(NOT LLVM_TARGET_INVENTORY_STATUS EQUAL 0)
  message(FATAL_ERROR
    "LLVM target inventory requires review. See ${LLVM_TARGET_INVENTORY_REPORT}\n"
    "${LLVM_TARGET_INVENTORY_OUTPUT}${LLVM_TARGET_INVENTORY_ERROR}")
endif()
message(STATUS "${LLVM_TARGET_INVENTORY_OUTPUT}")
include("${LLVM_TARGET_CACHE_FILE}")

# Tools, utilities, and tests are not needed.
set(LLVM_BUILD_TOOLS        OFF CACHE BOOL "")
set(LLVM_INCLUDE_TOOLS      OFF CACHE BOOL "")
set(LLVM_INCLUDE_UTILS      OFF CACHE BOOL "")
set(LLVM_INCLUDE_TESTS      OFF CACHE BOOL "")
set(LLVM_INCLUDE_EXAMPLES   OFF CACHE BOOL "")
set(LLVM_INCLUDE_BENCHMARKS OFF CACHE BOOL "")

# Threading is not needed in a single-threaded WASM context.
set(LLVM_ENABLE_THREADS     OFF CACHE BOOL "")

# Optional compression and XML libraries pull in unsupported native syscalls.
set(LLVM_ENABLE_ZLIB        OFF CACHE BOOL "")
set(LLVM_ENABLE_ZSTD        OFF CACHE BOOL "")
set(LLVM_ENABLE_LIBXML2     OFF CACHE BOOL "")

# Plugins rely on dynamic loading, which is irrelevant in WASM.
set(LLVM_ENABLE_PLUGINS     OFF CACHE BOOL "")

# Disable the IR optimizer and backend codegen passes entirely.
# We only use the MC layer (assembler/disassembler); we never touch LLVM IR.
set(LLVM_BUILD_INSTRUMENTED_COVERAGE OFF CACHE BOOL "")

add_subdirectory("${llvm_project_SOURCE_DIR}/llvm" "${llvm_project_BINARY_DIR}")

set(LLVM_MC_CORE_LIBS
  LLVMMC
  LLVMMCParser
  LLVMSupport
  LLVMBinaryFormat
  LLVMTargetParser
)

set(MAINSTREAM_DESC_LIBS
  LLVMX86Desc
  LLVMAArch64Desc
  LLVMARMDesc
)
set(MAINSTREAM_LIBS
  LLVMX86AsmParser LLVMX86Disassembler LLVMX86Info
  LLVMAArch64AsmParser LLVMAArch64Disassembler LLVMAArch64Info LLVMAArch64Utils
  LLVMARMAsmParser LLVMARMDisassembler LLVMARMInfo LLVMARMUtils
)

set(SYSTEMS_DESC_LIBS
  LLVMRISCVDesc
  LLVMMipsDesc
  LLVMPowerPCDesc
  LLVMSparcDesc
  LLVMWebAssemblyDesc
  LLVMBPFDesc
  LLVMLoongArchDesc
  LLVMSystemZDesc
)
set(SYSTEMS_LIBS
  LLVMRISCVAsmParser LLVMRISCVDisassembler LLVMRISCVInfo
  LLVMMipsAsmParser LLVMMipsDisassembler LLVMMipsInfo
  LLVMPowerPCAsmParser LLVMPowerPCDisassembler LLVMPowerPCInfo
  LLVMSparcAsmParser LLVMSparcDisassembler LLVMSparcInfo
  LLVMWebAssemblyAsmParser LLVMWebAssemblyDisassembler LLVMWebAssemblyInfo LLVMWebAssemblyUtils
  LLVMBPFAsmParser LLVMBPFDisassembler LLVMBPFInfo
  LLVMLoongArchAsmParser LLVMLoongArchDisassembler LLVMLoongArchInfo
  LLVMSystemZAsmParser LLVMSystemZDisassembler LLVMSystemZInfo
)

set(EMBEDDED_DESC_LIBS
  LLVMAVRDesc
  LLVMMSP430Desc
  LLVMM68kDesc
  LLVMXtensaDesc
  LLVMHexagonDesc
)
set(EMBEDDED_LIBS
  LLVMAVRAsmParser LLVMAVRDisassembler LLVMAVRInfo
  LLVMMSP430AsmParser LLVMMSP430Disassembler LLVMMSP430Info
  LLVMM68kAsmParser LLVMM68kDisassembler LLVMM68kInfo
  LLVMXtensaAsmParser LLVMXtensaDisassembler LLVMXtensaInfo
  LLVMHexagonAsmParser LLVMHexagonDisassembler LLVMHexagonInfo
)

# GitHub-hosted runners can compile in parallel, but several simultaneous
# wasm-ld jobs for LLVM archives can exhaust memory. Ninja applies this pool
# only to final links; object/library compilation remains parallel.
set_property(GLOBAL PROPERTY JOB_POOLS wasm_link_pool=1)

function(add_llvm_wasm_bundle target)
  cmake_parse_arguments(BUNDLE "" "SOURCE;OUTPUT_NAME;EXPORT_NAME" "DESC_LIBS;LIBS" ${ARGN})
  add_executable(${target} src/main.cpp ${BUNDLE_SOURCE})
  set_target_properties(${target} PROPERTIES OUTPUT_NAME ${BUNDLE_OUTPUT_NAME})

  # TargetMC registration objects live in the descriptor archives and are
  # referenced through function pointers, so force-load only this bundle's
  # descriptors. Other target families cannot leak into the resulting WASM.
  target_link_libraries(${target} PRIVATE
    ${LLVM_MC_CORE_LIBS}
    -Wl,--whole-archive
    ${BUNDLE_DESC_LIBS}
    -Wl,--no-whole-archive
    ${BUNDLE_LIBS}
  )
  target_include_directories(${target} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${llvm_project_SOURCE_DIR}/llvm/include
    ${llvm_project_BINARY_DIR}/include
  )

  if(EMSCRIPTEN)
    set_property(TARGET ${target} PROPERTY JOB_POOL_LINK wasm_link_pool)
    target_link_options(${target} PRIVATE
    -sEXPORTED_FUNCTIONS=_get_target_capabilities,_assemble_string,_disassemble_bytes,_disassemble_bytes_ex,_disassemble_bytes_ex2,_free_result,_malloc,_free
    -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString
    -sMODULARIZE=1
    "-sEXPORT_NAME='${BUNDLE_EXPORT_NAME}'"
    -sALLOW_MEMORY_GROWTH=1
    -sSTACK_SIZE=5MB
    -sERROR_ON_UNDEFINED_SYMBOLS=0
    -Oz
    -sASSERTIONS=0
    --strip-debug
    )
    target_compile_options(${target} PRIVATE -Oz)
  endif()
endfunction()

add_llvm_wasm_bundle(llvm_backend_mainstream
  SOURCE src/targets_mainstream.cpp
  OUTPUT_NAME llvm_backend_mainstream
  EXPORT_NAME LLVMEngineMainstream
  DESC_LIBS ${MAINSTREAM_DESC_LIBS}
  LIBS ${MAINSTREAM_LIBS}
)

add_llvm_wasm_bundle(llvm_backend_systems
  SOURCE src/targets_systems.cpp
  OUTPUT_NAME llvm_backend_systems
  EXPORT_NAME LLVMEngineSystems
  DESC_LIBS ${SYSTEMS_DESC_LIBS}
  LIBS ${SYSTEMS_LIBS}
)

add_llvm_wasm_bundle(llvm_backend_embedded
  SOURCE src/targets_embedded.cpp
  OUTPUT_NAME llvm_backend_embedded
  EXPORT_NAME LLVMEngineEmbedded
  DESC_LIBS ${EMBEDDED_DESC_LIBS}
  LIBS ${EMBEDDED_LIBS}
)

# Optional compatibility artifact preserving llvm_backend.js and LLVMEngine().
# The deployed website uses only the three split bundles above.
add_llvm_wasm_bundle(llvm_backend_full
  SOURCE src/targets_full.cpp
  OUTPUT_NAME llvm_backend
  EXPORT_NAME LLVMEngine
  DESC_LIBS ${MAINSTREAM_DESC_LIBS} ${SYSTEMS_DESC_LIBS} ${EMBEDDED_DESC_LIBS}
  LIBS ${MAINSTREAM_LIBS} ${SYSTEMS_LIBS} ${EMBEDDED_LIBS}
)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/llvm_backend_manifest.json.in"
  "${CMAKE_CURRENT_BINARY_DIR}/llvm_backend_manifest.json"
  @ONLY
)
