#include "targets.h"
#include <llvm/Support/TargetSelect.h>

void initialize_bundle_targets() {
    LLVMInitializeAVRTargetInfo();
    LLVMInitializeAVRTargetMC();
    LLVMInitializeAVRAsmParser();
    LLVMInitializeAVRDisassembler();

    LLVMInitializeMSP430TargetInfo();
    LLVMInitializeMSP430TargetMC();
    LLVMInitializeMSP430AsmParser();
    LLVMInitializeMSP430Disassembler();

    LLVMInitializeM68kTargetInfo();
    LLVMInitializeM68kTargetMC();
    LLVMInitializeM68kAsmParser();
    LLVMInitializeM68kDisassembler();

    LLVMInitializeXtensaTargetInfo();
    LLVMInitializeXtensaTargetMC();
    LLVMInitializeXtensaAsmParser();
    LLVMInitializeXtensaDisassembler();

    LLVMInitializeHexagonTargetInfo();
    LLVMInitializeHexagonTargetMC();
    LLVMInitializeHexagonAsmParser();
    LLVMInitializeHexagonDisassembler();
}
