#include <llvm/MC/MCAsmBackend.h>
#include <llvm/MC/MCAsmInfo.h>
#include <llvm/MC/MCCodeEmitter.h>
#include <llvm/MC/MCContext.h>
#include <llvm/MC/MCDisassembler/MCDisassembler.h>
#include <llvm/MC/MCInstPrinter.h>
#include <llvm/MC/MCInstrInfo.h>
#include <llvm/MC/MCObjectFileInfo.h>
#include <llvm/MC/MCObjectWriter.h>
#include <llvm/MC/MCParser/MCAsmParser.h>
#include <llvm/MC/MCParser/MCTargetAsmParser.h>
#include <llvm/MC/MCRegisterInfo.h>
#include <llvm/MC/MCStreamer.h>
#include <llvm/MC/MCSubtargetInfo.h>
#include <llvm/MC/MCTargetOptions.h>
#include <llvm/MC/TargetRegistry.h>
#include <llvm/Support/MemoryBuffer.h>
#include <llvm/Support/SourceMgr.h>
#include <llvm/Support/TargetSelect.h>
#include <llvm/Support/raw_ostream.h>
#include <llvm/TargetParser/SubtargetFeature.h>

#include "targets.h"

#include <emscripten/emscripten.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstring>

extern "C" {

static bool LLVM_INITIALIZED = false;

static void ensure_llvm_initialized() {
    if (LLVM_INITIALIZED) return;
    initialize_bundle_targets();
    LLVM_INITIALIZED = true;
}

// Return a malloc'd C string; caller must free via free_result().
static char* make_result(const std::string& s) {
    char* buf = static_cast<char*>(malloc(s.size() + 1));
    if (!buf) return nullptr;
    std::memcpy(buf, s.c_str(), s.size() + 1);
    return buf;
}

static std::string json_escape(llvm::StringRef value) {
    std::string out;
    out.reserve(value.size() + 8);
    static const char hex[] = "0123456789abcdef";
    for (unsigned char c : value) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (c < 0x20) {
                out += "\\u00";
                out += hex[c >> 4];
                out += hex[c & 0x0f];
            } else {
                out += static_cast<char>(c);
            }
        }
    }
    return out;
}

// Return LLVM's compiled CPU and feature catalog for a triple. The frontend can
// render this data without maintaining a second, incomplete target database.
// Passing a CPU also marks all features implied by that processor.
EMSCRIPTEN_KEEPALIVE
char* get_target_capabilities(const char* target_triple, const char* cpu) {
    ensure_llvm_initialized();

    llvm::Triple TheTriple(llvm::Triple::normalize(target_triple));
    std::string Error;
    const llvm::Target* TheTarget = llvm::TargetRegistry::lookupTarget("", TheTriple, Error);
    if (!TheTarget)
        return make_result("ERROR: Target lookup failed: " + Error);

    const char* cpuStr = (cpu && cpu[0]) ? cpu : "";
    std::unique_ptr<llvm::MCSubtargetInfo> STI(
        TheTarget->createMCSubtargetInfo(TheTriple, cpuStr, ""));
    if (!STI)
        return make_result("ERROR: Failed to create MCSubtargetInfo.");

    // LLVM does not expose an enumerable InstPrinter option catalog. Probe the
    // small set of documented target-printer options that are useful in this
    // UI and report only those recognized by the selected target. This keeps
    // the frontend target-agnostic as LLVM adds or removes support.
    std::vector<std::string> printerOptions;
    llvm::MCTargetOptions MCOptions;
    std::unique_ptr<llvm::MCRegisterInfo> MRI(TheTarget->createMCRegInfo(TheTriple));
    std::unique_ptr<llvm::MCAsmInfo> MAI(
        MRI ? TheTarget->createMCAsmInfo(*MRI, TheTriple, MCOptions) : nullptr);
    std::unique_ptr<llvm::MCInstrInfo> MII(TheTarget->createMCInstrInfo());
    std::unique_ptr<llvm::MCInstPrinter> IP(
        MRI && MAI && MII
            ? TheTarget->createMCInstPrinter(TheTriple, 0, *MAI, *MII, *MRI)
            : nullptr);
    if (IP) {
        for (const char* option : {"no-aliases", "numeric", "reg-names-raw", "reg-names-std"}) {
            if (IP->applyTargetSpecificCLOption(option))
                printerOptions.emplace_back(option);
        }
    }

    std::string json;
    llvm::raw_string_ostream os(json);
    os << "{\"target\":\"" << json_escape(TheTarget->getName())
       << "\",\"triple\":\"" << json_escape(TheTriple.str())
       << "\",\"cpu\":\"" << json_escape(cpuStr) << "\",\"cpus\":[";

    bool first = true;
    for (const auto& processor : STI->getAllProcessorDescriptions()) {
        if (!first) os << ',';
        first = false;
        os << "\"" << json_escape(processor.Key) << "\"";
    }
    os << "],\"features\":[";

    first = true;
    for (const auto& feature : STI->getAllProcessorFeatures()) {
        if (!first) os << ',';
        first = false;
        os << "{\"name\":\"" << json_escape(feature.Key)
           << "\",\"description\":\"" << json_escape(feature.Desc)
           << "\",\"enabled\":" << (STI->hasFeature(feature.Value) ? "true" : "false")
           << '}';
    }
    os << "],\"printerOptions\":[";
    first = true;
    for (const auto& option : printerOptions) {
        if (!first) os << ',';
        first = false;
        os << "\"" << json_escape(option) << "\"";
    }
    os << "]}";
    os.flush();
    return make_result(json);
}

// ── assemble_string ───────────────────────────────────────────────────────────
//
// asm_str         : assembly text (one or more instructions / labels)
// target_triple   : LLVM target triple, e.g. "x86_64-unknown-linux-gnu"
// cpu             : CPU preset string, e.g. "cortex-a76" or "" for generic
// features        : comma-separated feature string, e.g. "+avx2,+bmi" or ""
// use_intel_syntax: 1 = Intel (mov eax,1), 0 = AT&T (movl $1,%eax). x86 only.
// allow_relax     : 1 = allow assembler to relax instructions to larger encodings
//                   (e.g. RISC-V compressed → full-width when out of range)
//
// Returns: space-separated uppercase hex bytes, or "ERROR: ..." string.
// Caller must free with free_result().

EMSCRIPTEN_KEEPALIVE
char* assemble_string(const char* asm_str,
                      const char* target_triple,
                      const char* cpu,
                      const char* features,
                      int         use_intel_syntax,
                      int         allow_relax) {
    ensure_llvm_initialized();

    llvm::Triple TheTriple(llvm::Triple::normalize(target_triple));
    std::string Error;
    const llvm::Target* TheTarget = llvm::TargetRegistry::lookupTarget("", TheTriple, Error);
    if (!TheTarget)
        return make_result("ERROR: Target lookup failed: " + Error);

    llvm::MCTargetOptions MCOptions;
    MCOptions.MCRelaxAll = (allow_relax != 0);

    const char* cpuStr      = (cpu      && cpu[0])      ? cpu      : "";
    const char* featuresStr = (features && features[0]) ? features : "";

    // Hexagon requires an explicit CPU version; empty CPU gives no valid ISA.
    std::string cpuStrOwned;
    if (std::string(target_triple).find("hexagon") != std::string::npos && cpuStr[0] == '\0') {
        cpuStrOwned = "hexagonv60";
        cpuStr = cpuStrOwned.c_str();
    }

    std::unique_ptr<llvm::MCRegisterInfo> MRI(TheTarget->createMCRegInfo(TheTriple));
    if (!MRI) return make_result("ERROR: Failed to create MCRegisterInfo.");

    std::unique_ptr<llvm::MCAsmInfo> MAI(TheTarget->createMCAsmInfo(*MRI, TheTriple, MCOptions));
    if (!MAI) return make_result("ERROR: Failed to create MCAsmInfo.");

    std::unique_ptr<llvm::MCInstrInfo> MII(TheTarget->createMCInstrInfo());
    if (!MII) return make_result("ERROR: Failed to create MCInstrInfo.");

    std::unique_ptr<llvm::MCSubtargetInfo> STI(
        TheTarget->createMCSubtargetInfo(TheTriple, cpuStr, featuresStr));
    if (!STI) return make_result("ERROR: Failed to create MCSubtargetInfo.");

    llvm::SourceMgr SrcMgr;
    std::string AsmInput = std::string(asm_str) + "\n";
    std::unique_ptr<llvm::MemoryBuffer> Buffer =
        llvm::MemoryBuffer::getMemBuffer(AsmInput, "<inline-asm>");
    SrcMgr.AddNewSourceBuffer(std::move(Buffer), llvm::SMLoc());

    llvm::MCContext Ctx(TheTriple, *MAI, *MRI, *STI, &SrcMgr);

    std::unique_ptr<llvm::MCObjectFileInfo> MOFI(
        TheTarget->createMCObjectFileInfo(Ctx, /*PIC=*/false));
    if (!MOFI) return make_result("ERROR: Failed to create MCObjectFileInfo.");
    Ctx.setObjectFileInfo(MOFI.get());

    llvm::SmallVector<char, 256> OutputBuffer;
    llvm::raw_svector_ostream OS(OutputBuffer);

    std::unique_ptr<llvm::MCCodeEmitter> MCE(TheTarget->createMCCodeEmitter(*MII, Ctx));
    if (!MCE) return make_result("ERROR: Failed to create MCCodeEmitter.");

    std::unique_ptr<llvm::MCAsmBackend> MAB(
        TheTarget->createMCAsmBackend(*STI, *MRI, MCOptions));
    if (!MAB) return make_result("ERROR: Failed to create MCAsmBackend.");

    std::unique_ptr<llvm::MCObjectWriter> OW = MAB->createObjectWriter(OS);

    std::unique_ptr<llvm::MCStreamer> Streamer(TheTarget->createMCObjectStreamer(
        TheTriple, Ctx, std::move(MAB), std::move(OW), std::move(MCE), *STI));
    if (!Streamer) return make_result("ERROR: Failed to create MCStreamer.");

    std::unique_ptr<llvm::MCAsmParser> Parser(
        llvm::createMCAsmParser(SrcMgr, Ctx, *Streamer, *MAI));
    if (!Parser) return make_result("ERROR: Failed to create MCAsmParser.");

    // Intel/AT&T dialect is meaningful for x86 only and ignored elsewhere.
    if (use_intel_syntax) {
        MCOptions.AssemblyLanguage = "intel";
        Parser->setAssemblerDialect(1);
    } else {
        MCOptions.AssemblyLanguage = "att";
        Parser->setAssemblerDialect(0);
    }

    std::unique_ptr<llvm::MCTargetAsmParser> TAP(
        TheTarget->createMCAsmParser(*STI, *Parser, *MII));
    if (!TAP) return make_result("ERROR: Failed to create MCTargetAsmParser.");

    Parser->setTargetParser(*TAP);

    if (Parser->Run(/*NoInitialTextSection=*/false))
        return make_result("ERROR: Assembly failed. Check syntax for: " + TheTriple.str());

    // ── ELF extraction + relocation resolution ────────────────────────────
    const uint8_t* data = reinterpret_cast<const uint8_t*>(OutputBuffer.data());
    size_t dataSize = OutputBuffer.size();

    // ELF byte 5, EI_DATA: 1=little-endian, 2=big-endian
    bool elfBE = (dataSize > 5 && data[5] == 2);

    auto rd16 = [&](size_t off) -> uint16_t {
        if (off + 2 > dataSize) return 0;
        if (elfBE) return (static_cast<uint16_t>(data[off]) << 8) | data[off+1];
        return static_cast<uint16_t>(data[off]) | (static_cast<uint16_t>(data[off+1]) << 8);
    };
    auto rd32 = [&](size_t off) -> uint32_t {
        if (off + 4 > dataSize) return 0;
        uint32_t v = 0;
        if (elfBE) for (int i = 0; i < 4; ++i) v = (v << 8) | data[off+i];
        else       for (int i = 0; i < 4; ++i) v |= static_cast<uint32_t>(data[off+i]) << (8*i);
        return v;
    };
    auto rd64 = [&](size_t off) -> uint64_t {
        if (off + 8 > dataSize) return 0;
        uint64_t v = 0;
        if (elfBE) for (int i = 0; i < 8; ++i) v = (v << 8) | data[off+i];
        else       for (int i = 0; i < 8; ++i) v |= static_cast<uint64_t>(data[off+i]) << (8*i);
        return v;
    };
    auto wr32 = [&](std::vector<uint8_t>& buf, size_t off, uint32_t v) {
        if (off + 4 > buf.size()) return;
        if (elfBE) for (int i = 0; i < 4; ++i) buf[off+i] = (v >> (24 - 8*i)) & 0xff;
        else       for (int i = 0; i < 4; ++i) buf[off+i] = (v >> (8*i)) & 0xff;
    };
    auto wr64 = [&](std::vector<uint8_t>& buf, size_t off, uint64_t v) {
        if (off + 8 > buf.size()) return;
        if (elfBE) for (int i = 0; i < 8; ++i) buf[off+i] = (v >> (56 - 8*i)) & 0xff;
        else       for (int i = 0; i < 8; ++i) buf[off+i] = (v >> (8*i)) & 0xff;
    };

    std::vector<uint8_t> textBytes;

    if (dataSize < 16 || data[0] != 0x7f || data[1] != 'E' ||
        data[2] != 'L' || data[3] != 'F') {
        std::string raw = "WARN: Output is not ELF (" + std::to_string(dataSize) + " bytes): ";
        char hb[4];
        for (size_t i = 0; i < dataSize && i < 64; ++i) {
            snprintf(hb, sizeof(hb), "%02X ", data[i]); raw += hb;
        }
        return make_result(raw);
    }

    bool is64 = (data[4] == 2);

    uint64_t shoff     = is64 ? rd64(40) : rd32(32);
    uint16_t shentsize = is64 ? rd16(58) : rd16(46);
    uint16_t shnum     = is64 ? rd16(60) : rd16(48);
    uint16_t shstrndx  = is64 ? rd16(62) : rd16(50);

    auto shdr_offset = [&](uint16_t idx) -> size_t { return shoff + idx * shentsize; };
    auto sh_type   = [&](uint16_t idx) -> uint32_t { return rd32(shdr_offset(idx) + 4); };
    auto sh_flags  = [&](uint16_t idx) -> uint64_t {
        return is64 ? rd64(shdr_offset(idx) + 8) : rd32(shdr_offset(idx) + 8);
    };
    auto sh_off    = [&](uint16_t idx) -> uint64_t {
        return is64 ? rd64(shdr_offset(idx) + 24) : rd32(shdr_offset(idx) + 16);
    };
    auto sh_size   = [&](uint16_t idx) -> uint64_t {
        return is64 ? rd64(shdr_offset(idx) + 32) : rd32(shdr_offset(idx) + 20);
    };
    auto sh_link   = [&](uint16_t idx) -> uint32_t {
        return is64 ? rd32(shdr_offset(idx) + 40) : rd32(shdr_offset(idx) + 24);
    };
    auto sh_name   = [&](uint16_t idx) -> uint32_t { return rd32(shdr_offset(idx) + 0); };

    auto get_shstr = [&](uint32_t nameoff) -> std::string {
        if (shstrndx == 0 || shstrndx >= shnum) return "";
        uint64_t strtab_off  = sh_off(shstrndx);
        uint64_t strtab_size = sh_size(shstrndx);
        if (nameoff >= strtab_size) return "";
        size_t base = strtab_off + nameoff;
        std::string s;
        while (base < dataSize && data[base]) s += static_cast<char>(data[base++]);
        return s;
    };

    uint16_t textIdx   = 0xffff;
    uint16_t relaIdx   = 0xffff;
    uint16_t relIdx    = 0xffff;
    uint16_t symtabIdx = 0xffff;

    for (uint16_t i = 0; i < shnum; ++i) {
        uint32_t type = sh_type(i);
        std::string name = get_shstr(sh_name(i));
        if (type == 1 && (sh_flags(i) & 0x4))          textIdx   = i;
        else if (type == 4 && name == ".rela.text")     relaIdx   = i;
        else if (type == 9 && name == ".rel.text")      relIdx    = i;
        else if (type == 2)                             symtabIdx = i;
    }

    if (textIdx == 0xffff)
        return make_result("ERROR: Could not find .text section in ELF output.");

    uint64_t textFileOff  = sh_off(textIdx);
    uint64_t textFileSize = sh_size(textIdx);
    if (textFileOff + textFileSize > dataSize)
        return make_result("ERROR: .text section extends past ELF buffer.");
    textBytes.assign(data + textFileOff, data + textFileOff + textFileSize);

    auto sym_value = [&](uint32_t symIdx) -> uint64_t {
        if (symtabIdx == 0xffff) return 0;
        uint64_t symtab_off = sh_off(symtabIdx);
        size_t   entsize    = is64 ? 24 : 16;
        size_t   sym_off    = symtab_off + symIdx * entsize;
        return is64 ? rd64(sym_off + 8) : rd32(sym_off + 4);
    };

    // ── Rela (ELF64) relocations ──────────────────────────────────────────
    if (relaIdx != 0xffff) {
        uint64_t rela_off  = sh_off(relaIdx);
        uint64_t rela_size = sh_size(relaIdx);
        for (uint64_t e = 0; e + 24 <= rela_size; e += 24) {
            size_t   base     = rela_off + e;
            uint64_t r_off    = rd64(base);
            uint64_t r_info   = rd64(base + 8);
            int64_t  r_addend = static_cast<int64_t>(rd64(base + 16));
            uint32_t r_sym    = static_cast<uint32_t>(r_info >> 32);
            uint32_t r_type   = static_cast<uint32_t>(r_info & 0xffffffff);
            uint64_t S = sym_value(r_sym);
            uint64_t P = r_off;
            if (r_off + 4 > textBytes.size()) continue;

            switch (r_type) {
            // ── x86_64 ──────────────────────────────────────────────────
            case 1:  // R_X86_64_64
                wr64(textBytes, r_off, S + static_cast<uint64_t>(r_addend)); break;
            case 2:  // R_X86_64_PC32
            case 4: {// R_X86_64_PLT32
                int64_t v = static_cast<int64_t>(S) + r_addend - static_cast<int64_t>(P);
                wr32(textBytes, r_off, static_cast<uint32_t>(static_cast<int32_t>(v))); break;
            }
            case 10: // R_X86_64_32
            case 11: // R_X86_64_32S
                wr32(textBytes, r_off, static_cast<uint32_t>(S + static_cast<uint64_t>(r_addend))); break;
            // ── AArch64 ─────────────────────────────────────────────────
            case 258: // R_AARCH64_JUMP26
            case 259: {// R_AARCH64_CALL26
                int64_t off = (static_cast<int64_t>(S) + r_addend - static_cast<int64_t>(P)) >> 2;
                uint32_t instr = rd32(r_off);
                instr = (instr & 0xFC000000u) | (static_cast<uint32_t>(off) & 0x03FFFFFFu);
                wr32(textBytes, r_off, instr); break;
            }
            case 273: {// R_AARCH64_CONDBR19
                int64_t off = (static_cast<int64_t>(S) + r_addend - static_cast<int64_t>(P)) >> 2;
                uint32_t instr = rd32(r_off);
                instr = (instr & 0xFF00001Fu) | ((static_cast<uint32_t>(off) & 0x7FFFFu) << 5);
                wr32(textBytes, r_off, instr); break;
            }
            // ── RISC-V ──────────────────────────────────────────────────
            case 16: {// R_RISCV_BRANCH (B-type)
                int64_t offset = static_cast<int64_t>(S) + r_addend - static_cast<int64_t>(P);
                uint32_t instr = rd32(r_off);
                uint32_t imm = static_cast<uint32_t>(offset);
                instr &= 0x01FFF07Fu;
                instr |= ((imm >> 12) & 1) << 31;
                instr |= ((imm >> 5)  & 0x3f) << 25;
                instr |= ((imm >> 1)  & 0xf) << 8;
                instr |= ((imm >> 11) & 1) << 7;
                wr32(textBytes, r_off, instr); break;
            }
            case 17: {// R_RISCV_JAL (J-type)
                int64_t offset = static_cast<int64_t>(S) + r_addend - static_cast<int64_t>(P);
                uint32_t instr = rd32(r_off);
                uint32_t imm = static_cast<uint32_t>(offset);
                instr &= 0x00000FFFu;
                instr |= ((imm >> 20) & 1)    << 31;
                instr |= ((imm >> 1)  & 0x3ff) << 21;
                instr |= ((imm >> 11) & 1)    << 20;
                instr |= ((imm >> 12) & 0xff)  << 12;
                wr32(textBytes, r_off, instr); break;
            }
            default: break;
            }
        }
    }

    // ── Rel (ELF32) relocations for ARM32 and MIPS ───────────────────────
    if (relIdx != 0xffff) {
        uint64_t rel_off  = sh_off(relIdx);
        uint64_t rel_size = sh_size(relIdx);
        for (uint64_t e = 0; e + 8 <= rel_size; e += 8) {
            size_t   base   = rel_off + e;
            uint32_t r_off  = rd32(base);
            uint32_t r_info = rd32(base + 4);
            uint32_t r_sym  = r_info >> 8;
            uint8_t  r_type = r_info & 0xff;
            uint32_t S32 = static_cast<uint32_t>(sym_value(r_sym));
            if (r_off + 4 > textBytes.size()) continue;

            switch (r_type) {
            case 3: {// R_ARM_REL32
                int32_t v = static_cast<int32_t>(S32) - static_cast<int32_t>(r_off);
                wr32(textBytes, r_off, static_cast<uint32_t>(v)); break;
            }
            case 28: // R_ARM_CALL
            case 29: {// R_ARM_JUMP24
                int32_t off = (static_cast<int32_t>(S32) - static_cast<int32_t>(r_off) - 8) >> 2;
                uint32_t instr = rd32(r_off);
                instr = (instr & 0xFF000000u) | (static_cast<uint32_t>(off) & 0x00FFFFFFu);
                wr32(textBytes, r_off, instr); break;
            }
            // R_MIPS_26 = 4 in ELF32
            case 4: {
                uint32_t instr = rd32(r_off);
                uint32_t target = (S32 >> 2) & 0x03FFFFFFu;
                instr = (instr & 0xFC000000u) | target;
                wr32(textBytes, r_off, instr); break;
            }
            default: break;
            }
        }
    }

    if (textBytes.empty())
        return make_result("ERROR: .text section was empty after extraction.");

    std::string hexStr;
    hexStr.reserve(textBytes.size() * 3);
    char hb[4];
    for (size_t i = 0; i < textBytes.size(); ++i) {
        snprintf(hb, sizeof(hb), "%02X", textBytes[i]);
        hexStr += hb;
        if (i + 1 < textBytes.size()) hexStr += ' ';
    }
    return make_result(hexStr);
}

// ── disassemble_bytes ─────────────────────────────────────────────────────────
//
// bytes           : raw machine code bytes
// size            : number of bytes
// target_triple   : LLVM triple
// cpu             : CPU preset ("" = generic)
// features        : feature string ("" = baseline)
// use_intel_syntax: 1=Intel 0=AT&T, x86 only
//
// Returns: text with one instruction per line, or "ERROR: ..." string.

static char* disassemble_bytes_impl(const uint8_t* bytes,
                                    size_t         size,
                                    const char* target_triple,
                                    const char* cpu,
                                    const char* features,
                                    int            use_intel_syntax,
                                    int            print_imm_hex,
                                    const char*    printer_options) {
    ensure_llvm_initialized();

    llvm::Triple TheTriple(llvm::Triple::normalize(target_triple));
    std::string Error;
    const llvm::Target* TheTarget = llvm::TargetRegistry::lookupTarget("", TheTriple, Error);
    if (!TheTarget)
        return make_result("ERROR: Target lookup failed: " + Error);

    llvm::MCTargetOptions MCOptions;
    const char* cpuStr      = (cpu      && cpu[0])      ? cpu      : "";
    const char* featuresStr = (features && features[0]) ? features : "";

    // Hexagon requires an explicit CPU version (v60 minimum); an empty string
    // results in no valid ISA being selected and disassembly silently fails.
    std::string cpuStrOwned;
    if (std::string(target_triple).find("hexagon") != std::string::npos && cpuStr[0] == '\0') {
        cpuStrOwned = "hexagonv60";
        cpuStr = cpuStrOwned.c_str();
    }

    std::unique_ptr<llvm::MCRegisterInfo> MRI(TheTarget->createMCRegInfo(TheTriple));
    if (!MRI)
        return make_result("ERROR: Failed to create MCRegisterInfo.");
    std::unique_ptr<llvm::MCAsmInfo>      MAI(TheTarget->createMCAsmInfo(*MRI, TheTriple, MCOptions));
    std::unique_ptr<llvm::MCInstrInfo>    MII(TheTarget->createMCInstrInfo());
    std::unique_ptr<llvm::MCSubtargetInfo> STI(
        TheTarget->createMCSubtargetInfo(TheTriple, cpuStr, featuresStr));

    if (!MAI || !MII || !STI)
        return make_result("ERROR: Failed to initialize target components.");

    llvm::MCContext Ctx(TheTriple, *MAI, *MRI, *STI);

    std::unique_ptr<llvm::MCDisassembler> DisAsm(
        TheTarget->createMCDisassembler(*STI, Ctx));
    if (!DisAsm)
        return make_result("ERROR: Failed to create MCDisassembler.");

    // SyntaxVariant: 1 = Intel (x86 only), 0 = default for all other targets.
    // Hexagon, BPF, and several other targets only register a printer at
    // variant 0. If the requested variant returns null, fall back to 0.
    unsigned SyntaxVariant = use_intel_syntax ? 1 : 0;
    std::unique_ptr<llvm::MCInstPrinter> IP(
        TheTarget->createMCInstPrinter(TheTriple, SyntaxVariant, *MAI, *MII, *MRI));
    if (!IP && SyntaxVariant != 0)
        IP.reset(TheTarget->createMCInstPrinter(TheTriple, 0, *MAI, *MII, *MRI));
    if (!IP)
        return make_result("ERROR: Failed to create MCInstPrinter.");

    // Mark instruction aliases as acceptable for printing
    IP->setUseMarkup(false);
    IP->setPrintImmHex(print_imm_hex != 0);
    if (printer_options && printer_options[0]) {
        std::string options(printer_options);
        size_t start = 0;
        while (start <= options.size()) {
            size_t end = options.find(',', start);
            std::string option = options.substr(
                start, end == std::string::npos ? std::string::npos : end - start);
            const size_t firstChar = option.find_first_not_of(" \t");
            const size_t lastChar = option.find_last_not_of(" \t");
            option = firstChar == std::string::npos
                ? "" : option.substr(firstChar, lastChar - firstChar + 1);
            if (!option.empty() && !IP->applyTargetSpecificCLOption(option))
                return make_result("ERROR: Unsupported instruction printer option: " + option);
            if (end == std::string::npos) break;
            start = end + 1;
        }
    }

    llvm::ArrayRef<uint8_t> ByteArray(bytes, size);
    std::string ResultStr;
    llvm::raw_string_ostream ResultOS(ResultStr);

    uint64_t Addr = 0;
    while (Addr < size) {
        llvm::MCInst Inst;
        uint64_t InstSize = 0;
        auto Status = DisAsm->getInstruction(Inst, InstSize, ByteArray.slice(Addr), Addr,
                                              llvm::nulls());
        if (Status == llvm::MCDisassembler::Success) {
            // Prefix each line with "SIZE:<n>\t" so the JS parser knows the
            // exact byte count for this instruction without having to guess.
            char szPrefix[16];
            snprintf(szPrefix, sizeof(szPrefix), "SIZE:%llu\t",
                     static_cast<unsigned long long>(InstSize));
            ResultOS << szPrefix;
            IP->printInst(&Inst, Addr, "", *STI, ResultOS);
            ResultOS << "\n";
            Addr += InstSize;
        } else {
            char hb[32];
            snprintf(hb, sizeof(hb), "<unknown byte 0x%02X>\n",
                     static_cast<unsigned>(bytes[Addr]));
            ResultOS << hb;
            Addr += 1;
        }
    }

    ResultOS.flush();
    if (ResultStr.empty())
        ResultStr = "ERROR: Disassembler produced no output.";
    return make_result(ResultStr);
}

// Compatibility API retained for existing consumers and regression runners.
EMSCRIPTEN_KEEPALIVE
char* disassemble_bytes(const uint8_t* bytes,
                        size_t         size,
                        const char* target_triple,
                        const char* cpu,
                        const char* features,
                        int            use_intel_syntax) {
    return disassemble_bytes_impl(bytes, size, target_triple, cpu, features,
                                  use_intel_syntax, /*print_imm_hex=*/0,
                                  /*printer_options=*/nullptr);
}

// Extended API used by the browser for target-aware decimal/hex immediates.
EMSCRIPTEN_KEEPALIVE
char* disassemble_bytes_ex(const uint8_t* bytes,
                           size_t         size,
                           const char* target_triple,
                           const char* cpu,
                           const char* features,
                           int            use_intel_syntax,
                           int            print_imm_hex) {
    return disassemble_bytes_impl(bytes, size, target_triple, cpu, features,
                                  use_intel_syntax, print_imm_hex,
                                  /*printer_options=*/nullptr);
}

// Extended v2 API: adds LLVM target-specific InstPrinter options while
// retaining both older exports for existing callers.
EMSCRIPTEN_KEEPALIVE
char* disassemble_bytes_ex2(const uint8_t* bytes,
                            size_t         size,
                            const char* target_triple,
                            const char* cpu,
                            const char* features,
                            int            use_intel_syntax,
                            int            print_imm_hex,
                            const char*    printer_options) {
    return disassemble_bytes_impl(bytes, size, target_triple, cpu, features,
                                  use_intel_syntax, print_imm_hex,
                                  printer_options);
}

// ── free_result ───────────────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void free_result(char* ptr) { free(ptr); }

} // extern "C"
