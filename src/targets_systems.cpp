#include "targets.h"
#include <llvm/Support/TargetSelect.h>

void initialize_bundle_targets() {
    LLVMInitializeRISCVTargetInfo();
    LLVMInitializeRISCVTargetMC();
    LLVMInitializeRISCVAsmParser();
    LLVMInitializeRISCVDisassembler();

    LLVMInitializeMipsTargetInfo();
    LLVMInitializeMipsTargetMC();
    LLVMInitializeMipsAsmParser();
    LLVMInitializeMipsDisassembler();

    LLVMInitializePowerPCTargetInfo();
    LLVMInitializePowerPCTargetMC();
    LLVMInitializePowerPCAsmParser();
    LLVMInitializePowerPCDisassembler();

    LLVMInitializeSparcTargetInfo();
    LLVMInitializeSparcTargetMC();
    LLVMInitializeSparcAsmParser();
    LLVMInitializeSparcDisassembler();

    LLVMInitializeWebAssemblyTargetInfo();
    LLVMInitializeWebAssemblyTargetMC();
    LLVMInitializeWebAssemblyAsmParser();
    LLVMInitializeWebAssemblyDisassembler();

    LLVMInitializeBPFTargetInfo();
    LLVMInitializeBPFTargetMC();
    LLVMInitializeBPFAsmParser();
    LLVMInitializeBPFDisassembler();

    LLVMInitializeLoongArchTargetInfo();
    LLVMInitializeLoongArchTargetMC();
    LLVMInitializeLoongArchAsmParser();
    LLVMInitializeLoongArchDisassembler();

    LLVMInitializeSystemZTargetInfo();
    LLVMInitializeSystemZTargetMC();
    LLVMInitializeSystemZAsmParser();
    LLVMInitializeSystemZDisassembler();
}
