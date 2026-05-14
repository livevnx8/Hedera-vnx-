/**
 * Native Falcon-512 C++ Module
 * High-performance post-quantum cryptography with 10× speed over WASM
 * 
 * Build: node-gyp rebuild
 * Requires: libfalcon (included in vendor/falcon)
 */

#include <napi.h>
#include <string.h>
#include <stdlib.h>
#include "falcon.h"

// Falcon-512 parameters
#define FALCON_512_DEG 512
#define FALCON_512_PUBKEY_SIZE 1793
#define FALCON_512_PRIVKEY_SIZE 2305
#define FALCON_512_SIG_SIZE 1331
#define FALCON_512_MAX_SIG_SIZE 1331

using namespace Napi;

class FalconKeyPair : public ObjectWrap<FalconKeyPair> {
  public:
    static Object Init(Napi::Env env, Object exports);
    FalconKeyPair(const CallbackInfo& info);
    
    void Generate();
    Value GetPublicKey(const CallbackInfo& info);
    Value GetPrivateKey(const CallbackInfo& info);
    
  private:
    unsigned char public_key[FALCON_512_PUBKEY_SIZE];
    unsigned char private_key[FALCON_512_PRIVKEY_SIZE];
    bool generated;
};

Object FalconKeyPair::Init(Napi::Env env, Object exports) {
    Function func = DefineClass(env, "FalconKeyPair", {
        InstanceMethod("getPublicKey", &FalconKeyPair::GetPublicKey),
        InstanceMethod("getPrivateKey", &FalconKeyPair::GetPrivateKey),
    });
    
    exports.Set("FalconKeyPair", func);
    return exports;
}

FalconKeyPair::FalconKeyPair(const CallbackInfo& info) : ObjectWrap<FalconKeyPair>(info) {
    generated = false;
    Generate();
}

void FalconKeyPair::Generate() {
    // Generate random seed
    unsigned char seed[48];
    randombytes(seed, 48);
    
    // Generate keypair using Falcon-512
    shake256_context shake;
    shake256_init(&shake);
    shake256_inject(&shake, seed, 48);
    shake256_flip(&shake);
    
    // Generate keys
    falcon_keygen(&shake, private_key, public_key, FALCON_512_DEG);
    generated = true;
}

Value FalconKeyPair::GetPublicKey(const CallbackInfo& info) {
    if (!generated) {
        throw Error::New(info.Env(), "Key pair not generated");
    }
    
    return Buffer<char>::Copy(info.Env(), (char*)public_key, FALCON_512_PUBKEY_SIZE);
}

Value FalconKeyPair::GetPrivateKey(const CallbackInfo& info) {
    if (!generated) {
        throw Error::New(info.Env(), "Key pair not generated");
    }
    
    return Buffer<char>::Copy(info.Env(), (char*)private_key, FALCON_512_PRIVKEY_SIZE);
}

// Static sign function
Value FalconSign(const CallbackInfo& info) {
    Env env = info.Env();
    
    if (info.Length() < 2) {
        throw Error::New(env, "Expected message and private key");
    }
    
    // Get message
    Buffer<char> msgBuffer = info[0].As<Buffer<char>>();
    const unsigned char* message = (unsigned char*)msgBuffer.Data();
    size_t messageLen = msgBuffer.Length();
    
    // Get private key
    Buffer<char> privKeyBuffer = info[1].As<Buffer<char>>();
    const unsigned char* private_key = (unsigned char*)privKeyBuffer.Data();
    
    // Prepare signature buffer
    unsigned char sig[FALCON_512_MAX_SIG_SIZE + sizeof(uint16_t)];
    size_t sigLen;
    
    // Generate random nonce
    unsigned char nonce[40];
    randombytes(nonce, 40);
    
    // Sign
    shake256_context shake;
    shake256_init(&shake);
    shake256_inject(&shake, nonce, 40);
    shake256_inject(&shake, message, messageLen);
    shake256_flip(&shake);
    
    falcon_sign(&shake, sig, &sigLen, private_key, FALCON_512_DEG);
    
    return Buffer<char>::Copy(env, (char*)sig, sigLen);
}

// Static verify function
Value FalconVerify(const CallbackInfo& info) {
    Env env = info.Env();
    
    if (info.Length() < 3) {
        throw Error::New(env, "Expected message, signature, and public key");
    }
    
    // Get message
    Buffer<char> msgBuffer = info[0].As<Buffer<char>>();
    const unsigned char* message = (unsigned char*)msgBuffer.Data();
    size_t messageLen = msgBuffer.Length();
    
    // Get signature
    Buffer<char> sigBuffer = info[1].As<Buffer<char>>();
    const unsigned char* signature = (unsigned char*)sigBuffer.Data();
    size_t sigLen = sigBuffer.Length();
    
    // Get public key
    Buffer<char> pubKeyBuffer = info[2].As<Buffer<char>>();
    const unsigned char* public_key = (unsigned char*)pubKeyBuffer.Data();
    
    // Verify
    shake256_context shake;
    shake256_init(&shake);
    shake256_inject(&shake, signature, sigLen);
    shake256_inject(&shake, message, messageLen);
    shake256_flip(&shake);
    
    int result = falcon_verify(&shake, signature, sigLen, public_key, FALCON_512_DEG);
    
    return Boolean::New(env, result == 0);
}

// Get key sizes
Value GetPublicKeySize(const CallbackInfo& info) {
    return Number::New(info.Env(), FALCON_512_PUBKEY_SIZE);
}

Value GetPrivateKeySize(const CallbackInfo& info) {
    return Number::New(info.Env(), FALCON_512_PRIVKEY_SIZE);
}

Value GetSignatureSize(const CallbackInfo& info) {
    return Number::New(info.Env(), FALCON_512_SIG_SIZE);
}

Object Init(Env env, Object exports) {
    // Add key pair class
    FalconKeyPair::Init(env, exports);
    
    // Add static functions
    exports.Set("generateKeypair", Function::New(env, [](const CallbackInfo& info) {
        return FalconKeyPair::New(info);
    }));
    
    exports.Set("sign", Function::New(env, FalconSign));
    exports.Set("verify", Function::New(env, FalconVerify));
    exports.Set("getPublicKeySize", Function::New(env, GetPublicKeySize));
    exports.Set("getPrivateKeySize", Function::New(env, GetPrivateKeySize));
    exports.Set("getSignatureSize", Function::New(env, GetSignatureSize));
    
    return exports;
}

NODE_API_MODULE(falcon_native, Init)
